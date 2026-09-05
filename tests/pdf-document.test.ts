import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { repairNativeSpacing } from '../src/features/reader/pdf/geometry';
import { TextSourceSchema, preparePage, type TextSource } from '../src/features/reader/pdf/model';
import { createDocumentText, prepareDocumentPage, extractDocumentText, exportDocumentText, documentCoverage } from '../src/features/reader/pdf/document';
import { readDocumentPage, writeDocumentPage } from '../src/features/reader/pdf/document-cache';
import { createPdfSelection } from '../src/features/reader/pdf/selection';
import { hasAmbiguousLayout } from '../src/features/reader/pdf/layout-quality';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractNative, nativeItems } from '../src/features/reader/pdf/runtime';

const hash='b'.repeat(64);
const signal=new AbortController().signal;
test('real Republic page remains extractable with standard fonts and valid geometric anchors',async()=>{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(await readFile(resolve('data/books/plato-republic/source/the-republic-of-plato-jowett-1888-3rd-edition.pdf'))),standardFontDataUrl:resolve('node_modules/pdfjs-dist/standard_fonts')+'/'});
  try {
    const doc=await task.promise,page=await doc.getPage(301),content=await page.getTextContent();
    const raw=extractNative(content,page),repaired=repairNativeSpacing(raw,nativeItems(content));
    TextSourceSchema.parse(raw);TextSourceSchema.parse(repaired);
    assert.match(repaired.text,/gentle to friends/);
    const prepared=prepareDocumentPage(300,raw,repaired);
    assert.notEqual(prepared.status,'ocr-deferred');
  } finally {await task.destroy();}
});
test('ordinary word runs across a full line are not mistaken for separate columns',()=>{
  const s=native(items(Array.from({length:40},()=> 'word')));
  s.fragments.forEach((f,i)=>{f.rect={x:.1+(i%8)*.1,y:.1+Math.floor(i/8)*.05,width:.09,height:.03};});
  assert.equal(hasAmbiguousLayout(s.fragments),false);
  s.fragments.forEach((f,i)=>{f.rect={x:i%2?.7:.1,y:.1+Math.floor(i/2)*.04,width:.2,height:.03};});
  assert.equal(hasAmbiguousLayout(s.fragments),true);
});
function items(strings:string[]):TextItem[] {
  return strings.map((str,i)=>({str,dir:'ltr',transform:[10,0,0,10,i*50,100],width:40,height:10,fontName:'test',hasEOL:false}));
}
function native(runs:TextItem[]):TextSource {
  let text='';
  const fragments=runs.map((run,i)=>{const start=text.length;text+=run.str;const end=text.length;if(run.hasEOL)text+='\n';return {id:`n${i}`,text:run.str,start,end,rect:{x:.1,y:.1+i*.04,width:.3,height:.03},confidence:null};});
  return {text,fragments};
}
test('geometry repairs spacing before OCR and preserves every item and source offset',async()=>{
  const runs=items(['gentle','to','friends']);
  const raw=native(runs),original=structuredClone(raw),repaired=repairNativeSpacing(raw,runs);
  assert.equal(repaired.text,'gentle to friends');assert.equal(repaired.rawText,'gentletofriends');assert.deepEqual(raw,original);
  TextSourceSchema.parse(repaired);
  const page=await preparePage({fileHash:hash,pageIndex:0,language:'eng',native:repaired},()=>{throw Error('No OCR');},signal);
  const selected=await createPdfSelection(hash,[page],{page:0,offset:7},{page:0,offset:9});
  assert.equal(selected.anchors[0].quote,'to');assert.deepEqual(selected.anchors[0].locators[0].kind,'pdf');
});
test('repair retains explicit spaces, line breaks, CJK and RTL; it never guesses inside a run',()=>{
  const spaced=items(['already ','spaced']);assert.equal(repairNativeSpacing(native(spaced),spaced).text,'already spaced');
  const lines=items(['First','Second']);lines[1].transform[5]=80;
  assert.equal(repairNativeSpacing(native(lines),lines).text,'First\nSecond');
  const cjk=items(['中','文']);assert.equal(repairNativeSpacing(native(cjk),cjk).text,'中文');
  const rtl=items(['שלום','עולם']).map(i=>({...i,dir:'rtl'}));assert.equal(repairNativeSpacing(native(rtl),rtl).text,'שלוםעולם');
  const glued=items(['gentletofriends']);assert.equal(repairNativeSpacing(native(glued),glued).text,'gentletofriends');
  assert.throws(()=>repairNativeSpacing(native(lines),[]),/mapping/);
});
test('unreadable and empty pages defer OCR without claiming blank pages or completion',()=>{
  const empty=native([]),broken=native(items(['\uFFFD\uFFFD bad']));
  assert.equal(prepareDocumentPage(0,empty,empty).status,'ocr-deferred');
  assert.equal(prepareDocumentPage(1,broken,broken).status,'ocr-deferred');
});
test('previous local OCR is reusable but low confidence remains reviewable',async()=>{
  const empty=native([]),ocr=native(items(['Recognized words']));ocr.fragments[0].confidence=25;
  const cached=await preparePage({fileHash:hash,pageIndex:0,language:'eng',native:empty},async()=>ocr,signal);
  const page=prepareDocumentPage(0,empty,empty,cached);
  assert.equal(page.method,'ocr');assert.equal(page.status,'needs-review');assert.deepEqual(page.native,empty);
});
test('all pages are traversed; one failure does not hide later pages or missing text',async()=>{
  const calls:number[]=[];
  const result=await extractDocumentText(createDocumentText(hash,4),async index=>{
    calls.push(index);if(index===1)throw Error('Damaged page object');
    const source=native(items(index===2?[]:[`Page ${index+1}`]));
    return prepareDocumentPage(index,source,source);
  },signal,()=>{});
  assert.deepEqual(calls,[0,1,2,3]);assert.equal(result.status,'finished');
  assert.deepEqual(documentCoverage(result),{total:4,processed:4,ready:2,review:0,deferred:1,failed:1,pending:0});
  const exported=exportDocumentText(result);
  assert.equal(exported.text.split('\f').length,4);
  for(const p of exported.manifest.pages)assert.equal(exported.text.slice(p.startOffset,p.endOffset),p.source?.text??'');
  assert.equal(exported.manifest.nonTextContent,'not-analyzed');
});
test('cancel retains completed pages; resume retries failed and unvisited pages only',async()=>{
  const controller=new AbortController();const s=native(items(['Saved text']));
  const stopped=await extractDocumentText(createDocumentText(hash,3),async index=>{
    if(index===1)controller.abort();return prepareDocumentPage(index,s,s);
  },controller.signal,()=>{});
  assert.equal(stopped.status,'cancelled');assert.equal(stopped.pages[0].status,'ready');assert.equal(stopped.pages[1].status,'pending');
  const calls:number[]=[];
  const resumed=await extractDocumentText(stopped,async index=>{calls.push(index);return prepareDocumentPage(index,s,s);},signal,()=>{});
  assert.deepEqual(calls,[1,2]);assert.equal(documentCoverage(resumed).ready,3);
});
test('cache is versioned by document identity and page, and deferred pages are retried',async()=>{
  Object.assign(globalThis,{indexedDB});const s=native(items(['Cache text']));const ready=prepareDocumentPage(0,s,s);
  await writeDocumentPage(hash,ready);assert.deepEqual(await readDocumentPage(hash,0),ready);
  assert.equal(await readDocumentPage('c'.repeat(64),0),null);assert.equal(await readDocumentPage(hash,1),null);
  const empty=native([]);await writeDocumentPage(hash,prepareDocumentPage(1,empty,empty));assert.equal(await readDocumentPage(hash,1),null);
});
