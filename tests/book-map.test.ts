import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { GraphSchema, MapViewSchema } from '../src/shared/schemas';
import { createSampleGraph } from '../src/features/book-graph/sample-graph';
import { getBookPreview } from '../src/features/reader/book-preview';
import { initialView, orientation, nearestProjection, beginOrbit, advanceOrbit, approachingProjection, magneticPose, orbitFrom, SNAP_ENTER, springProgress, project, worldPoint, placeLabels } from '../src/features/book-graph/projection';
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
  for(const [mode,expected] of [['xy',{x:70,y:-30}],['xz',{x:70,y:-100}],['yz',{x:30,y:-100}]] as const){
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
    [{yaw:.04,pitch:.03},'xz'],
    [{yaw:Math.PI/2-.03,pitch:.02},'yz'],
    [{yaw:.02,pitch:-Math.PI/2+.03},'xy'],
    [{yaw:Math.PI+.02,pitch:.02},'xz'],
    [{yaw:Math.PI*4+.03,pitch:.01},'xz'],
  ] as const){const target=nearestProjection(pose);assert.equal(target.projection,mode);assert.ok(target.distance<SNAP_ENTER);assert.ok(Math.abs(target.yaw-pose.yaw)<.05);}
  assert.ok(nearestProjection({yaw:.75,pitch:.55}).distance>SNAP_ENTER);
});
test('magnetic pull is continuous and reversing input leaves either pole',()=>{
  const raw={yaw:.08,pitch:.06},attracted=magneticPose(raw);
  assert.ok(nearestProjection(attracted).distance<nearestProjection(raw).distance);
  assert.deepEqual(magneticPose({yaw:.75,pitch:.55}),{yaw:.75,pitch:.55});
  for(const pitch of [-Math.PI/2,Math.PI/2]){
    const dy=-Math.sign(pitch)*130;
    const pulled=orbitFrom({yaw:0,pitch},0,dy);
    assert.ok(Math.abs(pulled.pitch-pitch)>.7);
    assert.ok(Math.abs(pulled.pitch)<=Math.PI/2);
  }
});
test('magnetic settling progresses smoothly to exact alignment without opacity changes',()=>{
  assert.equal(springProgress(0),0);assert.equal(springProgress(520),1);
  let last=0;for(let t=16;t<=520;t+=16){const next=springProgress(t);assert.ok(next>=last&&next<=1);last=next;}
  assert.ok(springProgress(16)<.05);
});

test('60% wider magnetic capture attracts all three planes at 40 degrees',()=>{
  for(const projection of ['xy','xz','yz'] as const){
    const base=orientation(projection),offset=40*Math.PI/180;
    const pose=projection==='xy'?{...base,pitch:base.pitch+offset}:{...base,yaw:base.yaw+offset};
    const target=nearestProjection(pose);
    assert.equal(target.projection,projection);
    assert.ok(target.distance<SNAP_ENTER);
    assert.ok(nearestProjection(magneticPose(pose)).distance<target.distance);
  }
});

test('magnetic capture retains a clear boundary near 48 degrees',()=>{
  const radians=(degrees:number)=>degrees*Math.PI/180;
  const inside={yaw:radians(34),pitch:radians(33)};
  const outside={yaw:radians(35),pitch:radians(35)};
  assert.ok(nearestProjection(inside).distance<SNAP_ENTER);
  assert.ok(nearestProjection(outside).distance>SNAP_ENTER);
  assert.ok(nearestProjection(magneticPose(inside)).distance<nearestProjection(inside).distance);
  assert.deepEqual(magneticPose(outside),outside);
});

test('top-down capture works at every heading and chooses the nearest perpendicular',()=>{
  for(const yaw of [-7,-Math.PI,-Math.PI/2,-.58,0,.8,Math.PI/2,9]){
    for(const sign of [-1,1]){
      const pose={yaw,pitch:sign*(Math.PI/2-.15)},target=nearestProjection(pose);
      assert.equal(target.projection,'xy');
      assert.ok(Math.abs(target.yaw-yaw)<=Math.PI/4+1e-8);
      assert.ok(Math.abs(target.yaw/(Math.PI/2)-Math.round(target.yaw/(Math.PI/2)))<1e-8);
      assert.equal(magneticPose(pose).yaw,yaw);
      assert.ok(target.distance<SNAP_ENTER);
      const flat={yaw:target.yaw,pitch:target.pitch};
      const a=project({x:10,y:20,z:-100},flat),b=project({x:10,y:20,z:100},flat);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8);
    }
  }
});
test('an uninterrupted vertical drag reaches the pole without bouncing back',()=>{
  for(const sign of [-1,1]){
    const start={yaw:Math.PI/2,pitch:sign*.36};
    let previous=0;
    for(const dy of [50,150,250,350,600]){
      const pose=orbitFrom(start,0,sign*dy);
      assert.ok(Math.abs(pose.pitch)>=previous);previous=Math.abs(pose.pitch);
      assert.ok(Math.abs(pose.pitch)<=Math.PI/2);
    }
    assert.equal(previous,Math.PI/2);
  }
});
test('separate arrow steps leave a plane and snap when approaching the next',()=>{
  let pose=orientation('xz');
  for(let i=0;i<3;i++){
    const next=orbitFrom(pose,0,-20);
    assert.equal(approachingProjection(pose,next),null);
    pose=next;
  }
  assert.ok(pose.pitch<-.35);
  let captured=false;
  for(let i=0;i<12;i++){
    const next=orbitFrom(pose,0,-20),target=approachingProjection(pose,next);
    if(target){assert.equal(target.projection,'xy');captured=true;break;}
    pose=next;
  }
  assert.ok(captured);
  const top=orientation('xy'),away=orbitFrom(top,0,20);
  assert.equal(approachingProjection(top,away),null);
});

test('turning within the top plane does not count as leaving it',()=>{
  const from={...orientation('xy'),projection:'xy' as const};
  const rotated=orbitFrom(from,250,0);
  assert.equal(approachingProjection(from,rotated)?.projection,'xy');
  assert.equal(nearestProjection(rotated).projection,'xy');
  assert.equal(approachingProjection(from,orbitFrom(from,0,80)),null);
  assert.equal(approachingProjection(from,orbitFrom(from,0,150))?.projection,'xz');
});

test('continued gestures at either pole never reverse their direction',()=>{
  for(const sign of [-1,1]){
    let motion=beginOrbit({yaw:.8,pitch:sign*1.4});
    for(let i=0;i<30;i++)motion=advanceOrbit(motion,0,sign*10);
    assert.equal(motion.display.pitch,sign*Math.PI/2);
    // Lift the pointer, start another gesture, and continue in the same direction.
    motion=beginOrbit(motion.display);
    for(let i=0;i<30;i++)motion=advanceOrbit(motion,0,sign*10);
    assert.equal(motion.display.pitch,sign*Math.PI/2);
    // Reversing responds on the first pixel, regardless of accumulated overshoot.
    motion=advanceOrbit(motion,0,-sign);
    assert.ok(Math.abs(motion.display.pitch)<Math.PI/2);
    assert.ok(Math.abs(motion.display.pitch-sign*Math.PI/2)<=.006001);
    assert.equal(approachingProjection(motion.previous,motion.raw),null);
  }
});
test('reversing within the magnetic range has no jump or release bounce',()=>{
  let motion=beginOrbit({yaw:.8,pitch:-1});
  for(let i=0;i<10;i++)motion=advanceOrbit(motion,0,-3);
  const before=motion.display;
  motion=advanceOrbit(motion,0,1);
  assert.ok(motion.display.pitch>before.pitch);
  assert.ok(motion.display.pitch-before.pitch<=.006001);
  assert.equal(approachingProjection(motion.previous,motion.raw),null);
});
