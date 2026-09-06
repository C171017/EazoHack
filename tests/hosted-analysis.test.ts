import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { startHostedAnalysis } from '../src/features/book-graph/hosted-analysis';
import type { TextBook } from '../src/features/reader/upload-book';
const book = {kind:'txt',title:'孔乙己',bookId:'txt:test',preview:{}} as TextBook;
function setup(t: TestContext, status: string, signedIn = true) {
  const calls: {url:string;body:Record<string,string>}[]=[];
  const values = new Map<string,string>();
  t.mock.method(globalThis,'fetch',async(input: RequestInfo | URL,init?: RequestInit)=>{
    const url=String(input); calls.push({url,body:JSON.parse(String(init?.body??'{}'))});
    return Response.json(url.endsWith('/session')?{id:signedIn?'owner':null}:url.includes('analysis-status')?{status,jobId:'job'}:{id:'job'});
  });
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  return calls;
}
test('existing uploaded source starts hosted analysis without re-uploading',async t=>{
 const calls=setup(t,'idle');
 assert.deepEqual(await startHostedAnalysis(book,'source'),{source:'source',owner:'owner'});
 assert.deepEqual(calls.map(c=>c.url),['/api/cloud/session','/api/cloud/analysis-status?source=source','/api/cloud/analyze']);
 const key=calls[2].body.key;
 await startHostedAnalysis(book,'source');
 assert.equal(calls[5].body.key,key);
});
test('running maps reconnect without duplicate submissions',async t=>{
 const calls=setup(t,'running');await startHostedAnalysis(book,'source');assert.equal(calls.length,2);
});
test('retry resumes a queued dispatch instead of creating another job',async t=>{
 const calls=setup(t,'queued');await startHostedAnalysis(book,'source',true);
 assert.equal(calls[2].url,'/api/cloud/resume');assert.equal(calls[2].body.job,'job');
});
test('signed-out upload clearly requests authentication before cloud mutations',async t=>{
 const calls=setup(t,'idle',false);await assert.rejects(()=>startHostedAnalysis(book,'source'),/Sign in with Google/);assert.equal(calls.length,1);
});
test('ready maps open without submitting a new paid job',async t=>{
 const calls=setup(t,'ready');await startHostedAnalysis(book,'source');assert.equal(calls.length,2);
});
test('failed jobs are only resubmitted on explicit retry',async t=>{
 const calls=setup(t,'failed');await startHostedAnalysis(book,'source');assert.equal(calls.length,2);
 await startHostedAnalysis(book,'source',true);assert.equal(calls[4].url,'/api/cloud/analyze');
});
