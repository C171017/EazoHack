import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { GraphSchema, MapViewSchema } from '../src/shared/schemas';
import { createSampleGraph } from '../src/features/book-graph/sample-graph';
import { getBookPreview } from '../src/features/reader/book-preview';
import { initialView, orientation, nearestProjection, magneticPose, orbitFrom, SNAP_ENTER, SNAP_EXIT, springProgress, project, worldPoint, placeLabels } from '../src/features/book-graph/projection';
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
  for(const [mode,expected] of [['xy',{x:70,y:-30}],['xz',{x:70,y:-100}],['yz',{x:100,y:-30}]] as const){
    const p=project(point,orientation(mode));
    assert.ok(Math.abs(p.x-expected.x)<1e-9);assert.ok(Math.abs(p.y-expected.y)<1e-9);
  }
  const before=JSON.stringify(graph);
  for(const mode of ['3d','xy','xz','yz'] as const)for(const n of graph.nodes)project(worldPoint(n,[0,1])!,orientation(mode));
  assert.equal(JSON.stringify(graph),before);
});
test('excerpt range changes camera scale, never source coordinates',()=>{
  const range:[number,number]=[preview.startOffset/preview.totalCharacters,(preview.startOffset+preview.text.length)/preview.totalCharacters];
  assert.equal(worldPoint(graph.nodes[0],range)!.z,-200);
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

test('magnetic alignment finds all three planes and reversed views without a full-turn jump',()=>{
  for(const [pose,mode] of [
    [{yaw:.04,pitch:.03},'xy'],
    [{yaw:Math.PI/2-.03,pitch:.02},'yz'],
    [{yaw:.02,pitch:-Math.PI/2+.03},'xz'],
    [{yaw:Math.PI+.02,pitch:.02},'xy'],
    [{yaw:Math.PI*4+.03,pitch:.01},'xy'],
  ] as const){const target=nearestProjection(pose);assert.equal(target.projection,mode);assert.ok(target.distance<SNAP_ENTER);assert.ok(Math.abs(target.yaw-pose.yaw)<.05);}
  assert.ok(nearestProjection({yaw:.5,pitch:.4}).distance>SNAP_ENTER);
  assert.ok(SNAP_EXIT>SNAP_ENTER);
});
test('magnetic pull is continuous and deliberate drags can escape either pole',()=>{
  const raw={yaw:.08,pitch:.06},attracted=magneticPose(raw);
  assert.ok(nearestProjection(attracted).distance<nearestProjection(raw).distance);
  assert.deepEqual(magneticPose({yaw:.5,pitch:.4}),{yaw:.5,pitch:.4});
  for(const pitch of [-Math.PI/2,Math.PI/2])for(const dy of [-130,130]){
    const pulled=orbitFrom({yaw:0,pitch},0,dy);
    assert.ok(Math.abs(pulled.pitch-pitch)>SNAP_EXIT);
    assert.ok(Math.abs(pulled.pitch)<=Math.PI/2);
  }
});
test('magnetic settling progresses smoothly to exact alignment without opacity changes',()=>{
  assert.equal(springProgress(0),0);assert.equal(springProgress(520),1);
  let last=0;for(let t=16;t<=520;t+=16){const next=springProgress(t);assert.ok(next>=last&&next<=1);last=next;}
  assert.ok(springProgress(16)<.05);
});

test('wide magnetic capture attracts all three planes at 25 degrees',()=>{
  for(const projection of ['xy','xz','yz'] as const){
    const pose={...orientation(projection),yaw:orientation(projection).yaw+25*Math.PI/180};
    const target=nearestProjection(pose);
    assert.equal(target.projection,projection);
    assert.ok(target.distance<SNAP_ENTER);
    assert.ok(nearestProjection(magneticPose(pose)).distance<target.distance);
  }
});
