import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels } from '../src/features/book-graph/projection';
import { solveMapLayout, type LayoutPoint, type MapLayout } from '../src/features/book-graph/use-map-layout';

const scene:LayoutPoint[]=Array.from({length:9},(_,i)=>({id:String(i),x:460+(i%3)*75,y:340+Math.floor(i/3)*70,radius:15,cluster:true,label:`Group ${i}`,exiting:false}));
const solve=(points:LayoutPoint[],previous?:MapLayout)=>({key:'test',signature:'test',...solveMapLayout(points,1200,900,[],24,null,previous)});

test('settled labels and badges keep their node offsets through repeated small pans and reversals',()=>{
  const initial=solve(scene);
  assert.equal(initial.labels.size,scene.length);
  let previous=initial;
  for(const delta of [...Array.from({length:40},(_,i)=>i*1.3),...Array.from({length:40},(_,i)=>(39-i)*1.3)]) {
    const next=solve(scene.map(p=>({...p,x:p.x+delta,y:p.y+delta*.4})),previous);
    for(const p of scene) {
      assert.deepEqual(next.handles.get(p.id),initial.handles.get(p.id));
      const a=next.labels.get(p.id)!,b=initial.labels.get(p.id)!;
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,`${p.id} changed label slot during a pan`);
    }
    previous=next;
  }
});

test('entering or reordered nodes do not displace established label slots',()=>{
  const initial=solve(scene);
  const newcomer={...scene[0],id:'new',x:900,y:650};
  const next=solve([newcomer,...scene.toReversed()],initial);
  for(const p of scene)assert.deepEqual(next.labels.get(p.id),initial.labels.get(p.id));
});

test('labels can use each side when the other sides are blocked',()=>{
  const p={id:'one',label:'A note',x:250,y:250,radius:15};
  const cases=[
    {obstacle:{x:0,y:0,width:280,height:500},fits:({labelX}:{labelX:number})=>labelX>p.x},
    {obstacle:{x:220,y:0,width:280,height:500},fits:({labelX,width}:{labelX:number;width:number})=>labelX+width<p.x},
    {obstacle:{x:0,y:220,width:500,height:280},fits:({labelY}:{labelY:number})=>labelY+26<p.y},
    {obstacle:{x:0,y:0,width:500,height:280},fits:({labelY}:{labelY:number})=>labelY>p.y},
  ];
  for(const {obstacle,fits} of cases) {
    const labels=placeLabels([p],500,500,[obstacle]);
    assert.equal(labels.length,1);
    assert.ok(fits(labels[0]));
  }
});

test('after zoom or orbit changes spacing, retained labels are revalidated against markers and each other',()=>{
  const initial=solve(scene);
  const crowded=scene.map(p=>({...p,x:500+(p.x-500)*.5,y:400+(p.y-400)*.5}));
  const next=solve(crowded,initial);
  const handles=crowded.map(p=>({...p,x:p.x+next.handles.get(p.id)!.x,y:p.y+next.handles.get(p.id)!.y}));
  const boxes=handles.flatMap(p=>{const o=next.labels.get(p.id);return o?[{x:p.x+o.x,y:p.y+o.y,width:o.width,height:26}]:[];});
  assert.ok(boxes.length>=6);
  const overlaps=(a:typeof boxes[number],b:typeof boxes[number])=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(const [i,box] of boxes.entries()) {
    assert.ok(!boxes.slice(i+1).some(other=>overlaps(box,other)));
    assert.ok(!handles.some(p=>overlaps(box,{x:p.x-20,y:p.y-20,width:40,height:40})));
  }
});
