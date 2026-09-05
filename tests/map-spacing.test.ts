import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapViewSchema } from '../src/shared/schemas';
import { type Hierarchy, type MapEntry, clusterEntry } from '../src/shared/zoom-hierarchy';
import { initialView, orientation, placeLabels, placeClusterHandles } from '../src/features/book-graph/projection';
import { fitEntries } from '../src/features/book-graph/map-framing';
import { semanticWindow, toScreen, zoomAt } from '../src/features/book-graph/semantic-window';

const hierarchy=JSON.parse(readFileSync('data/books/plato-republic/analysis/semantic-hierarchy-v2-b7628d5e4649ece7/hierarchy.json','utf8')) as Hierarchy;
const roots=hierarchy.roots.map(id=>hierarchy.entries.find(n=>n.id===id)!);
const size={width:704,height:720},view={...initialView('test'),projection:'xy' as const,...orientation('xy')};

test('Republic overview fills more of the pane without changing scores or semantic zoom',()=>{
  const before=JSON.stringify(roots),fitted=fitEntries(roots,view,size,.2);
  assert.equal(fitted.zoom,1);assert.equal(JSON.stringify(roots),before);
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
  assert.equal(fitEntries([],view,size,0).zoom,1);
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

test('spare space expands children early, crowding retains the parent, and explicit selection reveals ties',()=>{
  const leaf=(id:string,x:number):MapEntry=>({...hierarchy.entries.find(n=>n.kind==='occurrence')!,id,parentId:'parent',position:{x,y:2,z:.5},bounds:{min:{x,y:2,z:.5},max:{x,y:2,z:.5}}});
  const a=leaf('a',.15),b=leaf('b',.85),parent=clusterEntry('parent','Group','Group',[a,b]);
  const roomy=semanticWindow([parent],new Map([['parent',[a,b]]]),view,size,[0,1],0);
  assert.deepEqual(roomy.nodes.map(n=>n.id),['a','b']);
  const tied=leaf('b',.15),crowded=clusterEntry('parent','Group','Group',[a,tied]);
  const pages=new Map([['parent',[a,tied]]]);
  assert.deepEqual(semanticWindow([crowded],pages,view,size,[0,1],2).nodes.map(n=>n.id),['parent']);
  assert.deepEqual(semanticWindow([crowded],pages,{...view,selectedNodeId:'parent'},size,[0,1],2).nodes.map(n=>n.id),['a','b']);
  assert.deepEqual(semanticWindow([parent],new Map(),view,size,[0,1],0).wanted,['parent']);
});

test('cluster offsets are bounded, deterministic and preserve semantic anchors beside controls',()=>{
  const input=[{id:'b',x:200,y:200,radius:15,cluster:true},{id:'a',x:200,y:200,radius:15,cluster:true}];
  const control={x:180,y:165,width:40,height:70};
  const result=placeClusterHandles(input,704,720,[control]);
  for(const p of result){assert.equal(p.anchorX,200);assert.equal(p.anchorY,200);assert.ok(Math.hypot(p.x-200,p.y-200)<=64.001);assert.ok(p.x<control.x||p.x>control.x+control.width||p.y<control.y||p.y>control.y+control.height);}
  assert.ok(Math.hypot(result[0].x-result[1].x,result[0].y-result[1].y)>40);
  assert.deepEqual(placeClusterHandles([...input].reverse(),704,720,[control]).reverse(),result);
});
