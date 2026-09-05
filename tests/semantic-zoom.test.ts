import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GraphSchema, MapViewSchema, type Graph } from '../src/shared/schemas';
import { leafEntry, clusterEntry, validateHierarchy, ZOOM_POLICY, type MapEntry, type Hierarchy } from '../src/shared/zoom-hierarchy';
import { initialView, orbitFrom } from '../src/features/book-graph/projection';
import { baseScale, semanticWindow, zoomAt, zoomLevel, toScreen, PageCache } from '../src/features/book-graph/semantic-window';
import { transitionPlan } from '../src/features/book-graph/node-transition';
import { buildHierarchy, spatialBatches, validateGroups } from '../src/server/book-analysis/hierarchy-run';
import { createMapStore, mapBootstrap, visibleLinks, nodeDetail } from '../src/server/book-map/store';

import { createSampleGraph } from '../src/features/book-graph/sample-graph';
import { getBookPreview } from '../src/features/reader/book-preview';
let graph:Graph;
before(async()=>{
  const sample=createSampleGraph(await getBookPreview()),copies=Array.from({length:32},(_,i)=>i);
  graph=GraphSchema.parse({...sample,nodes:copies.flatMap(i=>sample.nodes.map(n=>({...n,id:`${n.id}-copy-${i}`}))),identities:sample.identities.map(identity=>({...identity,occurrenceIds:copies.flatMap(i=>identity.occurrenceIds.map(id=>`${id}-copy-${i}`))})),edges:copies.flatMap(i=>sample.edges.map(e=>({...e,id:`${e.id}-copy-${i}`,source:`${e.source}-copy-${i}`,target:`${e.target}-copy-${i}`})))});
});
function fixture() {
  const entries=graph.nodes.map(leafEntry),children:Record<string,string[]>={};let frontier=entries.slice(),layer=0;
  while(frontier.length>8){const next:MapEntry[]=[];for(let i=0;i<frontier.length;i+=8){const members=frontier.slice(i,i+8);if(members.length===1){next.push(members[0]);continue;}const id=`test-${layer}-${i}`,n=clusterEntry(id,'A test group','Test only',members);members.forEach(n=>n.parentId=id);children[id]=members.map(n=>n.id);entries.push(n);next.push(n);}frontier=next;layer++;}
  const h:Hierarchy={version:'test',graphVersion:graph.graphVersion,fileHash:graph.fileHash,extractionVersion:graph.extractionVersion,promptVersion:'test',model:'test',createdAt:'test',roots:frontier.map(n=>n.id),depth:Math.max(...frontier.map(n=>n.height)),entries,children,rationale:'Test fixture'};
  const index=new Map(entries.map(n=>[n.id,n]));return {h,index,pages:new Map(Object.entries(children).map(([id,ids])=>[id,ids.map(id=>index.get(id)!)]))};
}
test('hierarchy preserves all accepted leaves and rejects membership, count, bounds, and version corruption',()=>{
  const {h}=fixture();assert.equal(validateHierarchy(h,graph).entries.filter(n=>n.kind==='occurrence').length,graph.nodes.length);
  for(const mutate of [
    (h:Hierarchy)=>{h.graphVersion='wrong';},
    (h:Hierarchy)=>{h.roots.push(h.roots[0]);},
    (h:Hierarchy)=>{h.children[h.roots[0]][0]=h.roots[0];},
    (h:Hierarchy)=>{h.children[h.roots[0]][0]='absent';},
    (h:Hierarchy)=>{h.entries.find(n=>n.kind==='cluster')!.leafCount++;},
    (h:Hierarchy)=>{h.entries.find(n=>n.kind==='cluster')!.bounds!.max.x=-1;},
    (h:Hierarchy)=>{h.entries[0].summary='Corrupted leaf';},
  ]){const copy=structuredClone(h);mutate(copy);assert.throws(()=>validateHierarchy(copy,graph));}
});
test('pinch preserves focal point, clamp and saved camera range; orbit never changes fit scale',()=>{
  const size={width:900,height:600},view={...initialView('test'),x:40,y:-22};
  const point={x:.7,y:3,z:.65},focus=toScreen(point,view,size,[0,1]);
  const next=zoomAt(view,8,focus,size);const projected=toScreen(point,next,size,[0,1]);assert.ok(Math.hypot(projected.x-focus.x,projected.y-focus.y)<1e-8);
  assert.equal(zoomAt(view,100,focus,size).zoom,48);assert.equal(zoomAt(view,.01,focus,size).zoom,.5);
  assert.equal(MapViewSchema.parse(next).zoom,8);
  const rotated={...next,...orbitFrom(next,200,80)};assert.equal(rotated.zoom,next.zoom);assert.equal(baseScale(size)*rotated.zoom,baseScale(size)*next.zoom);
});
test('threshold hysteresis avoids repeated layer changes near the same boundary',()=>{
  let level=zoomLevel(1.81,0,4);assert.equal(level,1);
  for(const zoom of [1.79,1.81,1.77,1.82,1.6]){level=zoomLevel(zoom,level,4);assert.equal(level,1);}
  assert.equal(zoomLevel(1.5,level,4),0);assert.equal(zoomLevel(48,0,4),4);
});
test('missing subtree retains parent; visible cut stays capped without dropping represented leaves',()=>{
  const {h,index,pages}=fixture(),roots=h.roots.map(id=>index.get(id)!),size={width:1200,height:900},view={...initialView('test'),sourceScope:'book' as const};
  const missing=semanticWindow(roots,new Map(),view,size,[0,1],2);assert.deepEqual(missing.nodes.map(n=>n.id),h.roots);assert.ok(missing.wanted.length);
  const loaded=semanticWindow(roots,pages,view,size,[0,1],2);assert.ok(loaded.nodes.length<=36);
  const descendants=(id:string):string[]=>h.children[id]?.flatMap(descendants)??[id];
  const leaves=loaded.nodes.flatMap(n=>descendants(n.id));assert.equal(new Set(leaves).size,leaves.length);assert.equal(leaves.length,graph.nodes.length);
  const away=semanticWindow(roots,pages,{...view,x:10000},size,[0,1],2);assert.equal(away.nodes.length,0);assert.equal(away.wanted.length,0);
});
test('only intersecting subtrees request data and cache is bounded through repeated exploration',()=>{
  const {h,index,pages}=fixture(),roots=h.roots.map(id=>index.get(id)!),size={width:900,height:600};
  const view={...initialView('test'),zoom:30,x:1200,sourceScope:'book' as const};
  const result=semanticWindow(roots,new Map(),view,size,[0,1],2);assert.ok(result.wanted.length<=h.roots.length);
  const cache=new PageCache(3);for(const [id,nodes] of pages)cache.put(id,nodes);assert.equal(cache.pages.size,3);
  const keep=[...cache.pages.keys()][0];cache.put('new',[],new Set([keep]));assert.ok(cache.pages.has(keep));assert.equal(cache.pages.size,3);
});
test('reversible transition starts at current positions, converges on parents and respects total cap',()=>{
  const {h,index}=fixture(),parent=index.get(h.roots[0])!,children=h.children[parent.id].map(id=>index.get(id)!);
  const expanded=transitionPlan([{node:parent,position:parent.position,opacity:1,radius:15,exiting:false}],children,index);
  assert.deepEqual(expanded[0].from.position,parent.position);
  const mid=expanded.map(p=>({...p.to,opacity:.5,position:p.from.position}));
  const reverse=transitionPlan(mid,[parent],index);assert.equal(reverse[0].from.opacity,.5);
  assert.ok(reverse.filter(p=>p.to.exiting).every(p=>JSON.stringify(p.to.position)===JSON.stringify(parent.position)));
  const many=Array.from({length:100},(_,i)=>({...mid[0],node:{...mid[0].node,id:`exit-${i}`}}));
  assert.ok(transitionPlan(many,graph.nodes.slice(0,36).map(leafEntry),index).length<=ZOOM_POLICY.transitions);
});
test('lazy bootstrap has no full graph or source quotes and relations preserve direction/type/evidence',()=>{
  const {h}=fixture(),store=createMapStore(graph,h),bootstrap=mapBootstrap(store);
  assert.equal('anchors' in bootstrap,false);assert.equal('nodes' in bootstrap,false);assert.equal(bootstrap.roots.length,h.roots.length);
  const links=visibleLinks(store,h.roots);for(const link of links)for(const id of link.relationIds){const original=graph.edges.find(e=>e.id===id)!;assert.equal(original.type,link.type);assert.ok(store.descendants.get(link.source)!.has(original.source));assert.ok(store.descendants.get(link.target)!.has(original.target));}
  assert.throws(()=>visibleLinks(store,[h.roots[0],h.children[h.roots[0]][0]]));
  const detail=nodeDetail(store,graph.nodes[0].id)!;assert.equal(detail.anchors.find(a=>a.id===detail.node.anchorIds[0])?.quote,graph.anchors.find(a=>a.id===detail.node.anchorIds[0])?.quote);
});
test('spatial grouping uses every candidate once and rejects invalid model partitions',()=>{
  const nodes=graph.nodes.map(leafEntry),batches=spatialBatches(nodes);assert.ok(batches.every(b=>b.length<=24));assert.equal(new Set(batches.flat().map(n=>n.id)).size,nodes.length);
  assert.throws(()=>validateGroups({groups:[{childIds:[nodes[0].id,nodes[0].id],label:'bad',summary:'bad',rationale:'bad'}]},nodes.slice(0,2)));
});
test('hierarchy pipeline reviews, resumes without new calls, and never replaces a good map after failure',async()=>{
  const outputRoot=await mkdtemp(path.join(os.tmpdir(),'eazo-hierarchy-'));let calls=0;
  const generate=async(_system:string,prompt:string)=>{
    calls++;let value:unknown;
    if(prompt.startsWith('Independently review'))value={rejected:[]};
    else {const nodes=JSON.parse(prompt.split('CHILDREN (data):\n')[1].split('\nSOURCE EVIDENCE')[0]) as MapEntry[];value={groups:Array.from({length:Math.ceil(nodes.length/6)},(_,i)=>({childIds:nodes.slice(i*6,(i+1)*6).map(n=>n.id),label:'Test summary',summary:'For pipeline testing only',rationale:'Test grouping'}))};}
    return {value,model:'test',modelVersion:'test',usage:{},durationMs:1};
  };
  const h=await buildHierarchy({graph,outputRoot,model:'test',generate});assert.ok(h.depth>=2);const count=calls;
  await buildHierarchy({graph,outputRoot,model:'test',generate});assert.equal(calls,count);
  const pointer=await readFile(path.join(outputRoot,'current-map.json'),'utf8');
  await assert.rejects(buildHierarchy({graph,outputRoot,model:'different',generate:async()=>{throw new Error('provider offline');}}));
  assert.equal(await readFile(path.join(outputRoot,'current-map.json'),'utf8'),pointer);
});
