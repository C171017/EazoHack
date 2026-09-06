import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {downloadAccountArchive} from '../src/features/cloud/export';

const owner='11111111-1111-4111-8111-111111111111';
test('portable account archive collects paginated metadata and private bytes with owner checks',async t=>{
 let blob:Blob|undefined;let clicked=false;
 t.mock.method(URL,'createObjectURL',(value:Blob)=>{blob=value;return 'blob:export-test';});
 t.mock.method(URL,'revokeObjectURL',()=>{});
 const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({click:()=>{clicked=true;}})}});
 t.after(()=>{if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');});
 t.mock.method(globalThis,'setTimeout',()=>0);
 const calls:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);calls.push(url);
  if(url.startsWith('/api/cloud/'))assert.equal(new Headers(init?.headers).get('x-eazo-owner'),owner);
  if(url==='/api/cloud/export')return Response.json({table:'book_sources',records:[{id:'source-1',source_object:owner+'/book/source.txt'}],nextCursor:'next',account:{id:owner},exportedAt:'2026-09-06T00:00:00Z'});
  if(url==='/api/cloud/export?cursor=next')return Response.json({table:'reading_snapshots',records:[{id:'saved-reading',payload:{readerPosition:12}}],nextCursor:null});
  if(url==='/api/cloud/export-file')return Response.json({url:'https://storage.test/private',bucket:'eazo-sources',path:owner+'/book/source.txt'});
  if(url==='https://storage.test/private')return new Response('Private book text');
  throw new Error('Unexpected URL');
 });
 await downloadAccountArchive(owner,()=>{});
 assert.equal(clicked,true);assert.ok(blob);
 const entries=unzipSync(new Uint8Array(await blob.arrayBuffer()));
 assert.equal(strFromU8(entries[`files/eazo-sources/${owner}/book/source.txt`]),'Private book text');
 assert.deepEqual(JSON.parse(strFromU8(entries['data/000002-reading_snapshots.json'])),[{id:'saved-reading',payload:{readerPosition:12}}]);
 assert.equal(calls.length,4);
});

test('account export stops when session changes and never downloads another account files',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Account changed'}},{status:403}));
 await assert.rejects(downloadAccountArchive(owner,()=>{}),/Account changed/);
});
