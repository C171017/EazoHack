import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapViewSchema } from '../src/shared/schemas';
import { type Hierarchy, type MapEntry, clusterEntry, ZOOM_POLICY } from '../src/shared/zoom-hierarchy';
import { initialView, orientation, placeLabels, placeClusterHandles } from '../src/features/book-graph/projection';
import { fitEntries } from '../src/features/book-graph/map-framing';
import { semanticWindow, toScreen, zoomAt, zoomIntoGroup } from '../src/features/book-graph/semantic-window';

const hierarchy=JSON.parse(readFileSync('data/books/plato-republic/analysis/semantic-hierarchy-v2-b7628d5e4649ece7/hierarchy.json','utf8')) as Hierarchy;
const roots=hierarchy.roots.map(id=>hierarchy.entries.find(n=>n.id===id)!);
const size={width:704,height:720},view={...initialView('test'),projection:'xy' as const,...orientation('xy')};

test('Republic overview fills more of the pane without changing scores or semantic zoom',()=>{
  const before=JSON.stringify(roots),fitted=fitEntries(roots,view,size,.2);
  assert.equal(fitted.zoom,ZOOM_POLICY.minZoom);assert.equal(JSON.stringify(roots),before);
  assert.deepEqual(MapViewSchema.parse(fitted),fitted);
  const points=roots.map(n=>toScreen(n.position!,fitted,size,[0,1],.2));
  const span=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
  assert.ok(span>400);assert.ok(points.every(p=>p.x>80&&p.x<size.width-80&&p.y>60&&p.y<size.height-60));
  const focus=points[0],zoomed=zoomAt(fitted,3,focus,size),after=toScreen(roots[0].position!,zoomed,size,[0,1],.2);
  assert.ok(Math.hypot(after.x-focus.x,after.y-focus.y)<1e-8);
});

test('fit handles all projections, empty data, ties and small panes with finite coordinates',()=>{
  for(const projection of ['3d','xy','xz','yz'] as const)for(const dimensions of [size,{width:320,height:500}]) {
    const camera={...view,projection,...orientation(projection)};
    const fitted=fitEntries(roots,camera,dimensions,0);
    const points=roots.map(n=>toScreen(n.position!,fitted,dimensions,[0,1],0));
    assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=dimensions.width&&p.y>=0&&p.y<=dimensions.height));
  }
  assert.equal(fitEntries([],view,size,0).zoom,ZOOM_POLICY.minZoom);
  assert.ok(MapViewSchema.safeParse(fitEntries([roots[0],roots[0]],view,size,0)).success);
});

test('reading moves notes through the saved frame without refitting or changing their source order',()=>{
  const camera=fitEntries(roots,{...view,projection:'xz',...orientation('xz')},size,.2);
  const a=toScreen(roots[0].position!,camera,size,[0,1],.2),b=toScreen(roots[0].position!,camera,size,[0,1],.3);
  assert.equal(a.x,b.x);assert.ok(b.y<a.y);
});

test('labels avoid all markers, other labels and controls, including tied positions',()=>{
  const points=Array.from({length:9},(_,i)=>({id:String(i),label:`Note ${i}`,x:280,y:230,radius:18}));
  const controls=[{x:0,y:0,width:704,height:60},{x:380,y:200,width:80,height:100}];
  const labels=placeLabels(points,size.width,size.height,controls);
  assert.equal(labels.length,9);
  const boxes=labels.map(p=>({x:p.labelX,y:p.labelY,width:p.width,height:26}));
  const overlaps=(a:typeof boxes[number],b:typeof boxes[number])=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(const [i,box] of boxes.entries())assert.ok(![...boxes.slice(i+1),...controls,{x:257,y:207,width:46,height:46}].some(other=>overlaps(box,other)));
  assert.equal(placeLabels(points,40,20, [{x:0,y:0,width:40,height:20}]).length,0);
});

test('hierarchy disclosure follows zoom depth, never spare space or selection',()=>{
  const leaf=(id:string,x:number):MapEntry=>({...hierarchy.entries.find(n=>n.kind==='occurrence')!,id,parentId:'parent',position:{x,y:2,z:.5},bounds:{min:{x,y:2,z:.5},max:{x,y:2,z:.5}}});
  const a=leaf('a',.15),b=leaf('b',.85),parent=clusterEntry('parent','Group','Group',[a,b]);
  const pages=new Map([['parent',[a,b]]]);
  for(const selectedNodeId of [null,'parent','a']) {
    const camera={...view,selectedNodeId};
    assert.deepEqual(semanticWindow([parent],pages,camera,size,[0,1],0).nodes.map(n=>n.id),['parent']);
    assert.deepEqual(semanticWindow([parent],pages,camera,size,[0,1],1).nodes.map(n=>n.id),['a','b']);
  }
  assert.deepEqual(semanticWindow([parent],new Map(),view,size,[0,1],0).wanted,[]);
  assert.deepEqual(semanticWindow([parent],new Map(),view,size,[0,1],1).wanted,['parent']);
  const tied=leaf('b',.15),crowded=clusterEntry('parent','Group','Group',[a,tied]);
  assert.deepEqual(semanticWindow([crowded],new Map([['parent',[a,tied]]]),view,size,[0,1],1).nodes.map(n=>n.id),['a','b']);
});

test('group navigation magnifies the fixed world and keeps the target above the inspector',()=>{
  for(const projection of ['3d','xy','xz','yz'] as const) {
    const before=fitEntries(roots,{...view,projection,...orientation(projection)},size,.2);
    const snapshot=JSON.stringify(roots);
    const after=zoomIntoGroup(roots[0],before,size,0,.2);
    assert.equal(after.framing,before.framing);
    assert.ok(after.zoom>before.zoom);
    const a=toScreen(roots[0].position!,before,size,[0,1],.2),b=toScreen(roots[1].position!,before,size,[0,1],.2);
    const c=toScreen(roots[0].position!,after,size,[0,1],.2),d=toScreen(roots[1].position!,after,size,[0,1],.2);
    assert.ok(Math.abs(Math.hypot(c.x-d.x,c.y-d.y)/Math.hypot(a.x-b.x,a.y-b.y)-after.zoom/before.zoom)<1e-8);
    assert.ok(Math.abs(c.x-size.width/2)<1e-8);
    assert.ok(Math.abs(c.y-(size.height-300)/2)<1e-8);
    assert.equal(JSON.stringify(roots),snapshot);
    assert.ok(MapViewSchema.safeParse(after).success);
    // Even a shallower group retained by the node budget must zoom further.
    assert.ok(zoomIntoGroup(roots[0],after,size,0,.2).zoom>after.zoom);
    assert.equal(zoomIntoGroup(roots[0],{...after,zoom:48},size,0,.2).zoom,ZOOM_POLICY.maxZoom);
  }
});

test('cluster offsets are bounded, deterministic and preserve semantic anchors beside controls',()=>{
  const input=[{id:'b',x:200,y:200,radius:15,cluster:true},{id:'a',x:200,y:200,radius:15,cluster:true}];
  const control={x:180,y:165,width:40,height:70};
  const result=placeClusterHandles(input,704,720,[control]);
  for(const p of result){assert.equal(p.anchorX,200);assert.equal(p.anchorY,200);assert.ok(Math.hypot(p.x-200,p.y-200)<=64.001);assert.ok(p.x<control.x||p.x>control.x+control.width||p.y<control.y||p.y>control.y+control.height);}
  assert.ok(Math.hypot(result[0].x-result[1].x,result[0].y-result[1].y)>40);
  assert.deepEqual(placeClusterHandles([...input].reverse(),704,720,[control]).reverse(),result);
});
