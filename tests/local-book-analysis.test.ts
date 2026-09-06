import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { LocalSourceSchema, localJobKey, localJobRoot, localJobStatus, startLocalJob, loadLocalMap } from '../src/server/book-analysis/local-jobs';
import { writeJson } from '../src/server/book-analysis/json-store';
import { requireLocalAnalysis } from '../src/server/book-analysis/local-access';
import { loadMapStore, mapBootstrap } from '../src/server/book-map/store';
import { getBookPreview } from '../src/features/reader/book-preview';

test('local analysis checks the visible host and rejects foreign origins and hosted execution', () => {
  const previous=process.env.NODE_ENV;
  Object.assign(process.env,{NODE_ENV:'development'});
  try {
    assert.doesNotThrow(()=>requireLocalAnalysis(new Request('http://localhost:3000/api/book-analysis',{headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}})));
    assert.throws(()=>requireLocalAnalysis(new Request('http://localhost:3000/api/book-analysis',{headers:{host:'127.0.0.1:3000',origin:'https://foreign.example'}})));
    assert.throws(()=>requireLocalAnalysis(new Request('http://foreign.example/api/book-analysis')));
    Object.assign(process.env,{NODE_ENV:'production'});
    assert.throws(()=>requireLocalAnalysis(new Request('http://localhost:3000/api/book-analysis')));
  } finally { Object.assign(process.env,{NODE_ENV:previous}); }
});

test('job identity binds the exact extracted source and interrupted jobs are retryable', async () => {
  const source=LocalSourceSchema.parse({bookId:`test-${crypto.randomUUID()}`,sourceText:'Exact source.',fileHash:'a'.repeat(64),extractionVersion:'txt-lf-v1'});
  const key=localJobKey(source),root=localJobRoot(key);
  assert.notEqual(key,localJobKey({...source,sourceText:'Changed source.'}));
  assert.notEqual(key,localJobKey({...source,extractionVersion:'new-extraction'}));
  assert.throws(()=>localJobRoot('../other'));
  try {
    assert.equal((await localJobStatus(key)).status,'idle');
    await writeJson(path.join(root,'status.json'),{status:'running',stage:'Working',updatedAt:Date.now(),pid:2147483647});
    assert.equal((await localJobStatus(key)).status,'failed');
    await writeJson(path.join(root,'status.json'),{status:'running',stage:'Working',updatedAt:Date.now(),pid:process.pid});
    assert.equal((await startLocalJob(source)).status,'running','Duplicate starts reuse an active job');
    await writeJson(path.join(root,'status.json'),{status:'ready',stage:'Ready',updatedAt:Date.now()});
    assert.equal((await startLocalJob(source)).status,'ready','Completed analysis is not charged again');
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('completed local maps load the correct source with a namespaced version and bounded bootstrap', async () => {
  const preview=await getBookPreview(),store=await loadMapStore();
  const source={bookId:store.graph.bookId,sourceText:preview.sourceText,fileHash:preview.fileHash,extractionVersion:preview.extractionVersion};
  const key=localJobKey(source),root=localJobRoot(key),version=store.hierarchy.version.replace(/^sample:[^:]+:/,'');
  try {
    await writeJson(path.join(root,'source.json'),source);
    await writeJson(path.join(root,'current-map.json'),{version});
    await writeJson(path.join(root,version,'graph.json'),store.graph);
    await writeJson(path.join(root,version,'hierarchy.json'),{...store.hierarchy,version});
    const loaded=await loadLocalMap(key),bootstrap=mapBootstrap(loaded);
    assert.equal(bootstrap.bookId,source.bookId);
    assert.equal(bootstrap.version,`local:${key}:${version}`);
    assert.ok(bootstrap.roots.length<=8);
    assert.equal(bootstrap.totalNodes,store.graph.nodes.length);
    await writeJson(path.join(root,'source.json'),{...source,sourceText:'Changed source'});
    await assert.rejects(loadLocalMap(key));
  } finally { await rm(root,{recursive:true,force:true}); }
});
