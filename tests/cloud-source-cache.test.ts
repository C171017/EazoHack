import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SourceTextCache,type SourceCacheIdentity} from '../src/server/cloud/source-cache';
const bytes=(text:string)=>new TextEncoder().encode(text);
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function identity(text:string,ownerId='a',sourceId='source'):SourceCacheIdentity {
 return {ownerId,sourceId,fileHash:'file',extractionVersion:'extract-v1',sourceSha256:hash(bytes(text))};
}

test('repeated immutable source loads coalesce and stay scoped to owner/source/version/hash',async()=>{
 const cache=new SourceTextCache();let loads=0;
 const load=async()=>{loads++;return bytes('text');};
 const id=identity('text');
 const first=cache.get(id,load),second=cache.get(id,load);
 assert.equal(first,second);assert.deepEqual(await Promise.all([first,second]),['text','text']);
 await cache.get(id,load);assert.equal(loads,1);
 for(const other of [{...id,ownerId:'b'},{...id,sourceId:'other'},{...id,fileHash:'changed'},{...id,extractionVersion:'v2'}])await cache.get(other,load);
 assert.equal(loads,5);assert.equal(cache.stats().entries,4);
 await cache.get(identity('new'),async()=>{loads++;return bytes('new');});assert.equal(loads,6);
});

test('cache enforces UTF-8 byte budget and evicts least recently used ready data',async()=>{
 const cache=new SourceTextCache({maxBytes:8,maxEntries:4});let reloads=0;
 const a=identity('你好','a','a'),b=identity('ab','a','b'),c=identity('cd','a','c');
 await cache.get(a,async()=>bytes('你好'));await cache.get(b,async()=>bytes('ab'));
 assert.equal(cache.stats().bytes,8);
 await cache.get(a,async()=>{throw new Error('must hit');});
 await cache.get(c,async()=>bytes('cd'));
 assert.equal(cache.stats().bytes,8);assert.equal(cache.stats().entries,2);
 await cache.get(b,async()=>{reloads++;return bytes('ab');});assert.equal(reloads,1);
 assert.ok(cache.stats().bytes<=8);
});

test('pending source loads count toward capacity and failed loads can retry',async()=>{
 const cache=new SourceTextCache({maxEntries:1});let release!:(value:Uint8Array)=>void;let excessLoads=0;
 const pending=cache.get(identity('a'),()=>new Promise(resolve=>{release=resolve;}));
 await Promise.resolve();
 await assert.rejects(cache.get(identity('b'),async()=>{excessLoads++;return bytes('b');}),error=>error instanceof Error&&'status'in error&&error.status===503);
 assert.equal(excessLoads,0);assert.equal(cache.stats().pending,1);
 release(bytes('wrong'));await assert.rejects(pending,/integrity/);assert.equal(cache.stats().entries,0);
 assert.equal(await cache.get(identity('a'),async()=>bytes('a')),'a');
});

test('mismatched hashes, malformed UTF-8 and oversized sources are never cached',async()=>{
 const cache=new SourceTextCache({maxBytes:4});
 await assert.rejects(cache.get(identity('good'),async()=>bytes('bad')),/integrity/);
 const malformed=Uint8Array.from([0xc3,0x28]);
 await assert.rejects(cache.get({...identity(''),sourceSha256:hash(malformed)},async()=>malformed),/UTF-8/);
 await assert.rejects(cache.get(identity('large'),async()=>bytes('large')),/limit/);
 assert.deepEqual(cache.stats(),{entries:0,bytes:0,pending:0});
});

test('TTL expires data and owner clearing cannot repopulate from an earlier pending load',async()=>{
 let now=0;const cache=new SourceTextCache({ttlMs:100,now:()=>now});let loads=0;
 const id=identity('data');const load=async()=>{loads++;return bytes('data');};
 await cache.get(id,load);now=99;await cache.get(id,load);assert.equal(loads,1);
 now=100;await cache.get(id,load);assert.equal(loads,2);
 await cache.get(identity('other','b'),async()=>bytes('other'));
 cache.clearOwner('a');assert.deepEqual(cache.stats(),{entries:1,bytes:5,pending:0});
 let release!:(value:Uint8Array)=>void;
 const pending=cache.get(id,()=>new Promise(resolve=>{release=resolve;}));await Promise.resolve();cache.clearOwner('a');
 assert.equal(cache.stats().pending,1);
 release(bytes('data'));await assert.rejects(pending,/account changed/);
 assert.deepEqual(cache.stats(),{entries:1,bytes:5,pending:0});
});
