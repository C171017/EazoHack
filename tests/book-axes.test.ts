import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { GraphSchema } from '../src/shared/schemas';
import { AxisBatchSchema, AxisReviewSchema, axisReviewPrompt } from '../src/server/book-analysis/axis-prompts';
import { assignBookAxes, validateAxisBatch } from '../src/server/book-analysis/axis-run';
import type { Generate } from '../src/server/book-analysis/contracts';
import { createSampleGraph } from '../src/features/book-graph/sample-graph';
import { getBookPreview } from '../src/features/reader/book-preview';
import { clusterEntry, leafEntry, validateHierarchy } from '../src/shared/zoom-hierarchy';
import { nodeDetail, createMapStore, unplacedNotes } from '../src/server/book-map/store';
import { calibrateBookAxes, depthInconsistencies, requiredDepthFloors } from '../src/server/book-analysis/axis-calibration';

test('axis reassessment preserves source, supports fractional/unknown values, reviews corrections, and resumes safely',async()=>{
  const graph=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axes-'));
  const assignments=graph.nodes.map((n,i)=>({nodeId:n.id,assessment:{
    reasoningDepth:{value:i===0?null:i===1?0:6.3,rationale:'Fixture: uncertainty, a starting point, or an internal argument.',anchorIds:n.anchorIds,prerequisiteNodeIds:i===2?[graph.nodes[1].id]:[]},
    generality:{value:i===0?8.7:3.1,rationale:'Fixture: scope of the particular claim.',anchorIds:n.anchorIds},
  }}));
  let calls=0,reviews=0;
  const generate:Generate=async(_system,_prompt,schema)=>{
    calls++;const value=schema===AxisBatchSchema?{assignments}:schema===AxisReviewSchema?{rejected:reviews++===0?[{nodeId:graph.nodes[0].id,reason:'Fixture asks for a second review.'}]:[]}:null;
    return {value,model:'fixture',modelVersion:'fixture',usage:{},durationMs:1};
  };
  try {
    await writeFile(path.join(dir,'current-graph.json'),'previous published graph');
    const result=await assignBookAxes({graph,outputRoot:dir,model:'fixture',generate});
    assert.equal(calls,4);assert.notEqual(result.graphVersion,graph.graphVersion);
    assert.deepEqual(result.anchors,graph.anchors);assert.deepEqual(result.edges,graph.edges);assert.deepEqual(result.identities,graph.identities);
    for(const [i,n] of result.nodes.entries())for(const key of ['id','label','summary','anchorIds','identityId','sourceLabel'] as const)assert.deepEqual(n[key],graph.nodes[i][key]);
    assert.deepEqual(result.nodes.map(n=>n.position.z),graph.nodes.map(n=>n.position.z));
    assert.equal(result.nodes[0].position.x,null);assert.equal(result.nodes[2].position.x,6.3/10);assert.equal(result.nodes[2].position.y,3.1*4/10);
    assert.equal(leafEntry(result.nodes[0]).position,null);
    const before=calls;assert.deepEqual(await assignBookAxes({graph,outputRoot:dir,model:'fixture',generate}),result);assert.equal(calls,before);
    assert.equal(await readFile(path.join(dir,'current-graph.json'),'utf8'),'previous published graph','axis stage must not publish before hierarchy validation');
    for(const mutate of [
      (g:typeof result)=>{g.nodes[2].position.x=.99;},
      (g:typeof result)=>{g.nodes[2].axisAssessment!.reasoningDepth.prerequisiteNodeIds=['missing'];},
      (g:typeof result)=>{g.nodes[2].axisAssessment!.generality.anchorIds=['missing'];},
      (g:typeof result)=>{g.nodes[1].axisAssessment!.reasoningDepth.prerequisiteNodeIds=[g.nodes[2].id];},
      (g:typeof result)=>{delete g.axisVersion;},
      (g:typeof result)=>{delete g.nodes[0].axisAssessment;},
    ]) {const copy=structuredClone(result);mutate(copy);assert.equal(GraphSchema.safeParse(copy).success,false);}
    const context=axisReviewPrompt(graph,[graph.nodes[2]],{assignments:[assignments[2]]});
    assert.ok(context.includes(JSON.stringify(graph.anchors.find(a=>a.id===graph.nodes[1].anchorIds[0])!.quote)));
    assert.throws(()=>validateAxisBatch({assignments:assignments.slice(1)},graph,graph.nodes));
    const store=createMapStore(result,{entries:result.nodes.map(leafEntry),roots:[],children:{}} as never);
    const detail=nodeDetail(store,result.nodes[2].id)!;
    assert.deepEqual(unplacedNotes(store).notes.map(n=>n.id),[result.nodes[0].id]);
    assert.throws(()=>unplacedNotes(store,-1));
    assert.ok(detail.neighbours.some(n=>n.id===result.nodes[1].id));
    assert.ok(detail.anchors.some(a=>a.id===result.nodes[2].axisAssessment!.generality.anchorIds[0]));
    const corrupt=structuredClone(result);corrupt.anchors[0].quote='Changed source';
    await writeFile(path.join(dir,result.graphVersion,'graph.json'),JSON.stringify(corrupt));
    await assert.rejects(assignBookAxes({graph,outputRoot:dir,model:'fixture',generate}),/changed anchors/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('representative groups retain a real child position and full ranges; legacy bounds centres still validate',async()=>{
  const graph=createSampleGraph(await getBookPreview());
  const leaves=graph.nodes.map(leafEntry);
  const parent=clusterEntry('parent','A group','Summary',leaves.slice(0,8),'representative-v1');
  assert.ok(leaves.some(n=>JSON.stringify(n.position)===JSON.stringify(parent.position)));
  assert.equal(parent.bounds!.min.y,Math.min(...leaves.slice(0,8).map(n=>n.position!.y)));
  const children=leaves.slice(0,8).map(n=>({...n,parentId:'parent'}));
  const h={version:'fixture',graphVersion:graph.graphVersion,fileHash:graph.fileHash,extractionVersion:graph.extractionVersion,promptVersion:'fixture',model:'fixture',createdAt:new Date().toISOString(),roots:['parent',leaves[8].id],depth:1,entries:[...children,leaves[8],parent],children:{parent:children.map(n=>n.id)},rationale:'Fixture'};
  assert.doesNotThrow(()=>validateHierarchy(h,graph));
  const legacy=clusterEntry('parent','A group','Summary',leaves.slice(0,8));
  assert.equal(legacy.positionRule,undefined);
  assert.doesNotThrow(()=>validateHierarchy({...h,entries:[...children,leaves[8],legacy]},graph));
});

test('unaccepted or malformed axis responses never overwrite a published graph',async()=>{
  const graph=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axes-fail-'));
  try {
    await writeFile(path.join(dir,'current-graph.json'),'working graph');
    await assert.rejects(assignBookAxes({graph,outputRoot:dir,model:'fixture',generate:async()=>({value:{assignments:[]},model:'fixture',modelVersion:'fixture',usage:{},durationMs:1})}));
    assert.equal(await readFile(path.join(dir,'current-graph.json'),'utf8'),'working graph');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('whole-book calibration catches cross-batch depth inversions and replays reviewed corrections',async()=>{
  const legacy=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axis-consistency-'));
  const graph=GraphSchema.parse({...legacy,axisVersion:'reasoning-generality-v2',axisAnalysis:{model:'fixture',promptVersion:'book-axes-v2',sourceGraphVersion:legacy.graphVersion,reviewStatus:'model_reviewed',completedAt:new Date().toISOString()},nodes:legacy.nodes.map((n,i)=>{
    const value=i===0?2:i===1?1:0;
    return {...n,position:{...n.position,x:value/10,y:2*4/10},axisAssessment:{reasoningDepth:{value,rationale:'Fixture internal inference.',anchorIds:n.anchorIds,prerequisiteNodeIds:i===1?[legacy.nodes[0].id]:[]},generality:{value:2,rationale:'Fixture scope.',anchorIds:n.anchorIds}}};
  })});
  let calls=0;
  const generate:Generate=async(_system,prompt,schema)=>{
    calls++;let value:unknown={rejected:[]};
    if(schema===AxisBatchSchema){
      const data=JSON.parse(prompt.split('DATA:\n')[1].split('\n')[0]);
      value={assignments:data.targets.map((nodeId:string)=>{
        const assessment=structuredClone(data.currentRatings.find((r:{nodeId:string})=>r.nodeId===nodeId).assessment);
        assessment.reasoningDepth.value=2;
        return {nodeId,assessment};
      })};
    }
    return {value,model:'fixture',modelVersion:'fixture',usage:{},durationMs:1};
  };
  try {
    assert.equal(depthInconsistencies(graph).length,1);
    const result=await calibrateBookAxes({graph,outputRoot:dir,model:'fixture',generate});
    assert.equal(result.axisAnalysis?.consistencyVersion,'axis-consistency-v1');
    assert.equal(depthInconsistencies(result).length,0);
    assert.equal(result.nodes[1].axisAssessment!.reasoningDepth.value,2);
    const before=calls;assert.deepEqual(await calibrateBookAxes({graph,outputRoot:dir,model:'fixture',generate}),result);assert.equal(calls,before);
    const bad=structuredClone(result);bad.nodes[1].axisAssessment!.reasoningDepth.value=1;bad.nodes[1].position.x=.1;
    assert.equal(GraphSchema.safeParse(bad).success,false);
    const unknown=structuredClone(result);unknown.nodes[0].axisAssessment!.reasoningDepth.value=null;unknown.nodes[0].position.x=null;
    assert.equal(GraphSchema.safeParse(unknown).success,false);
    const long=structuredClone(graph);
    for(let i=2;i<long.nodes.length;i++){
      long.nodes[i].axisAssessment!.reasoningDepth.value=1;long.nodes[i].position.x=.1;
      long.nodes[i].axisAssessment!.reasoningDepth.prerequisiteNodeIds=[long.nodes[i-1].id];
    }
    assert.equal(requiredDepthFloors(GraphSchema.parse(long)).get(long.nodes.at(-1)!.id),2);
    const closed=await calibrateBookAxes({graph:long,outputRoot:path.join(dir,'long'),model:'fixture',generate});
    assert.equal(depthInconsistencies(closed).length,0);
    assert.equal(closed.nodes.at(-1)!.axisAssessment!.reasoningDepth.value,2,'Long chains must not become unknown merely because propagation exceeded four passes');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('versioned scores preserve legacy coordinates and reassess rather than rescale old ratings',async()=>{
  const {BOOK_AXIS_VERSION,LEGACY_BOOK_AXIS_VERSION,axisCoordinate,coordinateRating,axisValue,axisRange,AxisAssessmentSchema}=await import('../src/shared/book-axes');
  const base=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axis-upgrade-'));
  const old=GraphSchema.parse({...base,axisVersion:LEGACY_BOOK_AXIS_VERSION,axisAnalysis:{model:'fixture',promptVersion:'book-axes-v1',sourceGraphVersion:base.graphVersion,reviewStatus:'model_reviewed',consistencyVersion:'axis-consistency-v1',completedAt:new Date().toISOString()},nodes:base.nodes.map(n=>({...n,position:{...n.position,x:2.25/4,y:3.75},axisAssessment:{reasoningDepth:{value:2.25,rationale:'Legacy inference.',anchorIds:n.anchorIds,prerequisiteNodeIds:[]},generality:{value:3.75,rationale:'Legacy scope.',anchorIds:n.anchorIds}}}))});
  assert.equal(axisValue(3.75,old.axisVersion),'3.75 / 4');
  const invalidLegacy=structuredClone(old);invalidLegacy.nodes[0].axisAssessment!.generality.value=5;
  assert.equal(GraphSchema.safeParse(invalidLegacy).success,false);
  let calls=0;
  try {
    const upgraded=await assignBookAxes({graph:old,outputRoot:dir,model:'fixture',generate:async(_s,_p,schema)=>{
      calls++;
      return {value:schema===AxisBatchSchema?{assignments:old.nodes.map(n=>({nodeId:n.id,assessment:{reasoningDepth:{...n.axisAssessment!.reasoningDepth,value:6.7},generality:{...n.axisAssessment!.generality,value:8.3}}}))}:{rejected:[]},model:'fixture',modelVersion:'fixture',usage:{},durationMs:1};
    }});
    assert.equal(calls,2);assert.equal(upgraded.axisVersion,BOOK_AXIS_VERSION);
    assert.equal(upgraded.axisAnalysis!.consistencyVersion,undefined,'Old review must not certify new scores');
    assert.equal(upgraded.nodes[0].position.x,.67);assert.equal(upgraded.nodes[0].position.y,8.3*4/10);
    assert.deepEqual(upgraded.anchors,old.anchors);assert.deepEqual(upgraded.edges,old.edges);
    assert.equal(axisValue(6.7,BOOK_AXIS_VERSION),'6.7 / 10');
    assert.equal(axisRange(6.7,8.3,BOOK_AXIS_VERSION),'6.7–8.3 / 10');
    for(const axis of ['x','y'] as const)for(let i=0;i<=100;i++) {
      const rating=i/10,position=axisCoordinate(rating,axis)!;
      assert.ok(Math.abs(coordinateRating(position,axis,BOOK_AXIS_VERSION)-rating)<1e-10);
    }
    const assessment=upgraded.nodes[0].axisAssessment!;
    for(const value of [-.1,10.1,6.71,Infinity,NaN])assert.equal(AxisAssessmentSchema.safeParse({...assessment,generality:{...assessment.generality,value}}).success,false);
    for(const value of [0,.1,6.7,9.9,10,null])assert.equal(AxisAssessmentSchema.safeParse({...assessment,generality:{...assessment.generality,value}}).success,true);
    const wrongPrecision=structuredClone(upgraded);wrongPrecision.nodes[0].axisAssessment!.generality.value=8.31;wrongPrecision.nodes[0].position.y=8.31*4/10;
    assert.equal(GraphSchema.safeParse(wrongPrecision).success,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('fractional ratings remain distinct across flat projections and off the reference grid',async()=>{
  const {axisCoordinate}=await import('../src/shared/book-axes');
  const {sourceWorld,project,orientation}=await import('../src/features/book-graph/projection');
  const point=(x:number,y:number)=>sourceWorld({x:axisCoordinate(x,'x')!,y:axisCoordinate(y,'y')!,z:.4},[0,1]);
  const a=point(6.7,8.3),b=point(6.8,8.4);
  assert.notEqual((a.x+250)%50,0);assert.notEqual((a.y+170)%50,0);
  for(const mode of ['xy','xz','yz'] as const) {
    const p=project(a,orientation(mode)),q=project(b,orientation(mode));
    assert.ok(Math.hypot(q.x-p.x,q.y-p.y)>0,'No flat projection may round distinct visible-axis scores into buckets');
  }
  assert.equal(a.z,b.z,'Rescoring axes must not move source progress');
});

test('long prerequisite chains refresh stale numeric prose before review without changing locked scores',async()=>{
  const base=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axis-prose-'));
  const graph=GraphSchema.parse({...base,axisVersion:'reasoning-generality-v2',axisAnalysis:{model:'fixture',promptVersion:'book-axes-v2',sourceGraphVersion:base.graphVersion,reviewStatus:'model_reviewed',completedAt:new Date().toISOString()},nodes:base.nodes.map((n,i)=>{
    const value=i===0?8:1;
    return {...n,position:{...n.position,x:value/10,y:.8},axisAssessment:{reasoningDepth:{value,rationale:`The total depth is ${value}.`,anchorIds:n.anchorIds,prerequisiteNodeIds:i?[base.nodes[i-1].id]:[]},generality:{value:2,rationale:'Bounded cases.',anchorIds:n.anchorIds}}};
  })});
  let repairs=0,closureReviews=0;
  const generate:Generate=async(_s,prompt,schema)=>{
    let value:unknown={rejected:[]};
    if(schema===AxisBatchSchema){
      const data=JSON.parse(prompt.split('DATA:\n')[1].split('\n')[0]);
      const isRepair=prompt.startsWith('Rewrite ONLY');if(isRepair)repairs++;
      value={assignments:data.targets.map((nodeId:string)=>{
        const assessment=structuredClone(data.currentRatings.find((r:{nodeId:string})=>r.nodeId===nodeId).assessment);
        assessment.reasoningDepth.value=isRepair&&repairs===1?9:8;
        assessment.reasoningDepth.rationale='The total required chain has depth 8.';
        return {nodeId,assessment};
      })};
    } else if(prompt.includes('minimum total-depth band')) {
      closureReviews++;
      const proposal=JSON.parse(prompt.split('PROPOSAL:\n')[1].split('\nDATA:')[0]);
      assert.ok(proposal.assignments.every((a:{assessment:{reasoningDepth:{value:number;rationale:string}}})=>a.assessment.reasoningDepth.value===8&&a.assessment.reasoningDepth.rationale==='The total required chain has depth 8.'));
    }
    return {value,model:'fixture',modelVersion:'fixture',usage:{},durationMs:1};
  };
  try {
    const result=await calibrateBookAxes({graph,outputRoot:dir,model:'fixture',generate});
    assert.equal(repairs,2,'A repair that changes a locked score must be retried');assert.equal(closureReviews,1);
    assert.ok(result.nodes.every(n=>n.axisAssessment!.reasoningDepth.value===8));
    assert.deepEqual(result.nodes.map(n=>n.axisAssessment!.reasoningDepth.prerequisiteNodeIds),graph.nodes.map(n=>n.axisAssessment!.reasoningDepth.prerequisiteNodeIds));
    assert.deepEqual(result.anchors,graph.anchors);assert.equal(depthInconsistencies(result).length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
