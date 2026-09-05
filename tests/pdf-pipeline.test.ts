import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { assessText, preparePage, validateLayout, type TextSource } from '../src/features/reader/pdf/model';
import { createPdfSelection, extractionId } from '../src/features/reader/pdf/selection';
import { readPageCache, writePageCache } from '../src/features/reader/pdf/cache';
import { GET as sourceGet } from '../src/app/api/pdf/source/route';
import { GET as assetGet } from '../src/app/api/pdf/assets/[...asset]/route';
import { requestLayout } from '../src/server/pdf/layout';
import { POST as layoutPost } from '../src/app/api/pdf/layout/route';

const signal=new AbortController().signal;
const source=(text:string):TextSource=>({text,fragments:text?[{id:'n0',text,start:0,end:text.length,rect:{x:.1,y:.1,width:.7,height:.03},confidence:null}]:[]});
const input=(native:TextSource)=>({fileHash:'a'.repeat(64),pageIndex:0,language:'eng',native});
test('good embedded text bypasses OCR and preserves Unicode and exact source',async()=>{
  const native=source('An exact quotation.\n中文无需按英语单词长度检测。');
  const result=await preparePage(input(native),()=>{throw new Error('Must not call OCR');},signal);
  assert.equal(result.method,'embedded');assert.deepEqual(result.source,native);assert.equal(result.reviewRequired,false);
});
test('damaged embedded text routes to OCR while preserving both originals',async()=>{
  const native=source('Broken \uFFFD\uFFFD\uFFFD characters');const recognized={...source('Restored words.'),rawText:'Restored words.\n\n'};
  const result=await preparePage(input(native),async()=>recognized,signal);
  assert.equal(result.reason,'damaged-embedded');assert.deepEqual(result.native,native);assert.deepEqual(result.ocr,recognized);assert.deepEqual(result.source,recognized);
});
test('missing embedded text uses OCR; empty recognition remains explicit and cannot create quotes',async()=>{
  const result=await preparePage(input(source('')),async()=>source(''),signal);
  assert.equal(result.reason,'missing-embedded');assert.equal(result.reviewRequired,true);
  await assert.rejects(createPdfSelection(result.fileHash,[result],{page:0,offset:0},{page:0,offset:1}),/outside/);
});
test('OCR failure and cancellation never masquerade as successful extraction',async()=>{
  await assert.rejects(preparePage(input(source('')),async()=>{throw new Error('Engine unavailable');},signal),/unavailable/);
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(preparePage(input(source('')),async()=>{calls++;return source('hello');},c.signal));assert.equal(calls,0);
});
test('manual retry can replace plausible embedded text; low confidence stays marked',async()=>{
  const recognized=source('Maybe correct.');recognized.fragments[0].confidence=20;
  const result=await preparePage({...input(source('Plausible but wrong.')),forceOcr:true},async()=>recognized,signal);
  assert.equal(result.reason,'manual-ocr');assert.equal(result.reviewRequired,true);
});
test('ambiguous columns are flagged and layout proposals can neither drop nor invent text',()=>{
  const s=source('abcdefgh');s.fragments=Array.from({length:8},(_,i)=>({id:`n${i}`,text:s.text[i],start:i,end:i+1,rect:{x:i<4?.1:.7,y:.1+(i%4)*.1,width:.15,height:.03},confidence:null}));
  assert.equal(assessText(s).ambiguousLayout,true);
  const raw=JSON.stringify(s);const order=s.fragments.map(f=>f.id).reverse();
  assert.deepEqual(validateLayout(s,{order,headings:[{fragmentId:'n0',level:1}]}).order,order);
  assert.equal(JSON.stringify(s),raw);
  assert.throws(()=>validateLayout(s,{order:order.slice(1),headings:[]}),/every fragment/);
  assert.throws(()=>validateLayout(s,{order:[...order.slice(1),'fake'],headings:[]}),/every fragment/);
  assert.throws(()=>validateLayout(s,{order,headings:[],text:'Model-rewritten source'}));
});
test('cross-page anchors retain exact UTF-16 ranges, PDF identities and text versions',async()=>{
  const p0=await preparePage(input(source('Alpha 🙂 beta.')),async()=>source(''),signal);
  const p1=await preparePage({...input(source('Gamma delta.')),pageIndex:1},async()=>source(''),signal);
  const capturedAt='2026-09-05T10:11:12Z';
  const selection=await createPdfSelection(p0.fileHash,[p0,p1],{page:0,offset:6},{page:1,offset:5},undefined,capturedAt);
  assert.equal(selection.selection.createdAt,capturedAt);
  assert.equal(selection.selection.selectedText,'🙂 beta.\nGamma');assert.equal(selection.anchors.length,2);
  assert.equal(selection.anchors[1].locators[0].kind,'pdf');assert.equal(selection.anchors[1].quote,'Gamma');
  await assert.rejects(createPdfSelection('wrong',[p0,p1],{page:0,offset:0},{page:1,offset:3}),/ready/);
  assert.notEqual(await extractionId(p0),await extractionId({...p0,source:source('Different text.')}));
});
test('cached extraction survives reopening and is separated by file, page and OCR language',async()=>{
  Object.assign(globalThis,{indexedDB});
  const p=await preparePage(input(source('Retained quotation.')),async()=>source(''),signal);
  await writePageCache(p);assert.deepEqual(await readPageCache(p.fileHash,0,'eng'),p);
  assert.equal(await readPageCache('different',0,'eng'),null);assert.equal(await readPageCache(p.fileHash,1,'eng'),null);assert.equal(await readPageCache(p.fileHash,0,'fra'),null);
});
test('PDF range requests return the requested bytes and reject invalid ranges',async()=>{
  const r=await sourceGet(new Request('http://localhost/api/pdf/source',{headers:{range:'bytes=0-4'}}));
  assert.equal(r.status,206);assert.equal(await r.text(),'%PDF-');assert.equal(r.headers.get('Content-Length'),'5');
  const bad=await sourceGet(new Request('http://localhost/api/pdf/source',{headers:{range:'bytes=999999999999-'}}));assert.equal(bad.status,416);
});
test('runtime asset endpoint cannot traverse outside its allowlist',async()=>{
  const r=await assetGet(new Request('http://localhost'),{params:Promise.resolve({asset:['..','package.json']})});assert.equal(r.status,404);
  const good=await assetGet(new Request('http://localhost'),{params:Promise.resolve({asset:['ocr','worker.min.js']})});assert.equal(good.status,200);assert.match(good.headers.get('Content-Type')!,/javascript/);
});
test('optional layout HTTP adapter validates proposals and rejects failures without altering source',async t=>{
  const old=process.env.EAZO_PDF_LAYOUT_URL;
  process.env.EAZO_PDF_LAYOUT_URL='https://layout.example.test';
  const s=source('Retain every source word.'),before=JSON.stringify(s);
  try {
    const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({order:['n0'],headings:[{fragmentId:'n0',level:1}]}));
    const result=await requestLayout(s,signal);assert.deepEqual(result.proposal.order,['n0']);assert.equal(JSON.stringify(s),before);
    fetch.mock.mockImplementation(async()=>Response.json({order:[],headings:[]}));
    await assert.rejects(requestLayout(s,signal),/every fragment/);
    fetch.mock.mockImplementation(async()=>new Response('Service unavailable',{status:503}));
    await assert.rejects(requestLayout(s,signal),/503/);
    const foreign=await layoutPost(new Request('http://localhost/api/pdf/layout',{method:'POST',headers:{origin:'https://foreign.example'}}));assert.equal(foreign.status,403);
  }finally{if(old===undefined)delete process.env.EAZO_PDF_LAYOUT_URL;else process.env.EAZO_PDF_LAYOUT_URL=old;}
});
