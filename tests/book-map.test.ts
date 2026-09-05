import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { GraphSchema, MapViewSchema } from '../src/shared/schemas';
import { createSampleGraph } from '../src/features/book-graph/sample-graph';
import { getBookPreview } from '../src/features/reader/book-preview';
import { initialView, confineCamera, orientation, nearestProjection, beginOrbit, advanceOrbit, approachingProjection, magneticPose, orbitFrom, SNAP_ENTER, springProgress, project, worldPoint, placeLabels } from '../src/features/book-graph/projection';
import { WorkspaceSnapshotSchema } from '../src/features/persistence';

let preview: Awaited<ReturnType<typeof getBookPreview>>;
let graph: ReturnType<typeof createSampleGraph>;
before(async()=>{preview=await getBookPreview();graph=createSampleGraph(preview);});
test('sample coordinates resolve to exact immutable source text',()=>{
  for(const node of graph.nodes){
    const anchor=graph.anchors.find(a=>a.id===node.anchorIds[0])!;
    const locator=anchor.locators[0];
    assert.equal(preview.text.slice(locator.startOffset-preview.startOffset,locator.endOffset-preview.startOffset),anchor.quote);
    assert.equal(node.position.z,locator.startOffset/preview.totalCharacters);
    assert.equal(node.position.y,node.structuralLevel);
  }
});
test('identities preserve distinct source occurrences, with no invented identity coordinate',()=>{
  const repeated=graph.identities.find(i=>i.label==='Civic ritual')!;
  assert.equal(repeated.occurrenceIds.length,2);
  assert.notEqual(graph.nodes.find(n=>n.id===repeated.occurrenceIds[0])!.position.z,graph.nodes.find(n=>n.id===repeated.occurrenceIds[1])!.position.z);
  assert.equal('position' in repeated,false);
});
test('graph rejects dangling references, source/version mismatch and invented Z',()=>{
  for(const edit of [
    (g:typeof graph)=>{g.edges[0].target='missing';},
    (g:typeof graph)=>{g.nodes[0].position.z=.8;},
    (g:typeof graph)=>{g.nodes[0].position.y=4;},
    (g:typeof graph)=>{g.nodes[0].identityId='missing';},
    (g:typeof graph)=>{g.nodes[0].themeTerritoryIds=['missing'];},
    (g:typeof graph)=>{g.anchors[0].fileHash='other';},
    (g:typeof graph)=>{g.edges[0].evidenceAnchorIds=[];},
    (g:typeof graph)=>{g.nodes.push(g.nodes[0]);},
    (g:typeof graph)=>{g.territories.reverse();},
  ]){const copy=structuredClone(graph);edit(copy);assert.equal(GraphSchema.safeParse(copy).success,false);}
});
test('unknown coordinates remain null and do not appear at the origin',()=>{
  const copy=structuredClone(graph);
  copy.nodes[0].structuralLevel=null;copy.nodes[0].position.y=null;
  assert.equal(GraphSchema.safeParse(copy).success,true);
  assert.equal(worldPoint(copy.nodes[0],[0,1]),null);
});
test('canonical projections use one world, preserving visible axes and suppressing only depth',()=>{
  const point={x:70,y:30,z:100};
  for(const [mode,expected] of [['xy',{x:70,y:30}],['xz',{x:70,y:-100}],['yz',{x:-30,y:-100}]] as const){
    const p=project(point,orientation(mode));
    assert.ok(Math.abs(p.x-expected.x)<1e-9);assert.ok(Math.abs(p.y-expected.y)<1e-9);
  }
  const before=JSON.stringify(graph);
  for(const mode of ['3d','xy','xz','yz'] as const)for(const n of graph.nodes)project(worldPoint(n,[0,1])!,orientation(mode));
  assert.equal(JSON.stringify(graph),before);
});
test('excerpt range changes camera scale, never source coordinates',()=>{
  const range:[number,number]=[preview.startOffset/preview.totalCharacters,(preview.startOffset+preview.text.length)/preview.totalCharacters];
  assert.equal(worldPoint(graph.nodes[0],range)!.z,400);
  assert.notEqual(worldPoint(graph.nodes[0],range)!.z,worldPoint(graph.nodes[0],[0,1])!.z);
});
test('overlapping projection labels separate without moving semantic points',()=>{
  const points=Array.from({length:9},(_,i)=>({id:String(i),x:100,y:100,label:`Occurrence ${i}`}));
  const placed=placeLabels(points,700,500);
  for(const [i,a] of placed.entries())for(const b of placed.slice(i+1)) {
    assert.ok(a.labelX+a.width<=b.labelX || b.labelX+b.width<=a.labelX || a.labelY+26<=b.labelY || b.labelY+26<=a.labelY);
  }
  assert.ok(placed.every(p=>p.x===100&&p.y===100));
});
test('saved 3D view round-trips and old 2D checkpoints remain readable',()=>{
  const view={...initialView(graph.graphVersion),projection:'yz' as const,selectedNodeId:graph.nodes[0].id,readerAnchorId:graph.anchors[0].id};
  assert.deepEqual(MapViewSchema.parse(JSON.parse(JSON.stringify(view))),view);
  const legacy={schemaVersion:1,id:'old',bookId:graph.bookId,graphViewport:{x:12,y:30,zoom:1.5},savedAt:new Date().toISOString()};
  assert.equal(WorkspaceSnapshotSchema.parse(legacy).mapView,null);
  assert.deepEqual(WorkspaceSnapshotSchema.parse({...legacy,mapView:view}).mapView,view);
  assert.equal(MapViewSchema.safeParse({...view,zoom:Infinity}).success,false);
});

test('all camera entry points and flat projections stay in the starting octant',()=>{
  const inside=(pose:{yaw:number;pitch:number})=>{
    assert.ok(pose.yaw>=-Math.PI/2&&pose.yaw<=0);
    assert.ok(pose.pitch>=0&&pose.pitch<=Math.PI/2);
    // The viewing direction stays on the positive side of each grid plane.
    assert.ok(-Math.sin(pose.yaw)*Math.cos(pose.pitch)>=-1e-12);
    assert.ok(Math.cos(pose.yaw)*Math.cos(pose.pitch)>=-1e-12);
    assert.ok(Math.sin(pose.pitch)>=-1e-12);
  };
  for(const projection of ['3d','xy','xz','yz'] as const)inside(orientation(projection));
  for(const yaw of [-20,-1,0,1,20])for(const pitch of [-20,0,.4,20]){
    const pose=confineCamera({yaw,pitch});inside(pose);
    inside(magneticPose(pose));inside(nearestProjection(pose));
    for(const dx of [-10000,10000])for(const dy of [-10000,10000])inside(orbitFrom(pose,dx,dy));
  }
});
test('each fence blocks continued gestures and responds immediately on reversal',()=>{
  for(const [axis,sign,bound] of [['yaw',-1,-Math.PI/2],['yaw',1,0],['pitch',-1,0],['pitch',1,Math.PI/2]] as const){
    let motion=beginOrbit(orientation('3d'));
    const step=(amount:number)=>advanceOrbit(motion,axis==='yaw'?amount:0,axis==='pitch'?amount:0);
    for(let i=0;i<30;i++)motion=step(sign*100);
    assert.equal(motion.display[axis],bound);
    motion=beginOrbit(motion.display);
    for(let i=0;i<30;i++)motion=step(sign*100);
    assert.equal(motion.display[axis],bound);
    motion=step(-sign);
    assert.ok((motion.display[axis]-bound)*sign<0);
    assert.ok(Math.abs(motion.display[axis]-bound)<=.006001);
  }
});
test('arrow steps leave a fence and approach the next flat view',()=>{
  let pose=orientation('xz');
  for(let i=0;i<3;i++){
    const next=orbitFrom(pose,0,20);
    assert.equal(approachingProjection(pose,next),null);pose=next;
  }
  let captured=false;
  for(let i=0;i<12;i++){
    const next=orbitFrom(pose,0,20),target=approachingProjection(pose,next);
    if(target){assert.equal(target.projection,'xy');captured=true;break;}pose=next;
  }
  assert.ok(captured);
});
test('magnetic attraction and settling remain smooth inside the fences',()=>{
  const raw={yaw:-.08,pitch:.06};
  assert.ok(nearestProjection(magneticPose(raw)).distance<nearestProjection(raw).distance);
  assert.ok(nearestProjection(raw).distance<SNAP_ENTER);
  let motion=beginOrbit({yaw:-.8,pitch:1});
  for(let i=0;i<10;i++)motion=advanceOrbit(motion,0,3);
  const before=motion.display;
  motion=advanceOrbit(motion,0,-1);
  assert.ok(motion.display.pitch<before.pitch);
  assert.ok(before.pitch-motion.display.pitch<=.006001);
  assert.equal(approachingProjection(motion.previous,motion.raw),null);
  assert.equal(springProgress(0),0);assert.equal(springProgress(520),1);
  for(let t=0;t<=520;t+=16){
    const ease=springProgress(t);assert.ok(ease>=0&&ease<=1);
  }
});
