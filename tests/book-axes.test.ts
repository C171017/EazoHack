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
import { calibrateBookAxes, depthInconsistencies } from '../src/server/book-analysis/axis-calibration';

test('axis reassessment preserves source, supports fractional/unknown values, reviews corrections, and resumes safely',async()=>{
  const graph=createSampleGraph(await getBookPreview()),dir=await mkdtemp(path.join(os.tmpdir(),'eazo-axes-'));
  const assignments=graph.nodes.map((n,i)=>({nodeId:n.id,assessment:{
    reasoningDepth:{value:i===0?null:i===1?0:2.25,rationale:'Fixture: uncertainty, a starting point, or an internal argument.',anchorIds:n.anchorIds,prerequisiteNodeIds:i===2?[graph.nodes[1].id]:[]},
    generality:{value:i===0?3.75:1.25,rationale:'Fixture: scope of the particular claim.',anchorIds:n.anchorIds},
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
    assert.equal(result.nodes[0].position.x,null);assert.equal(result.nodes[2].position.x,2.25/4);assert.equal(result.nodes[2].position.y,1.25);
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
  const graph=GraphSchema.parse({...legacy,axisVersion:'reasoning-generality-v1',axisAnalysis:{model:'fixture',promptVersion:'book-axes-v1',sourceGraphVersion:legacy.graphVersion,reviewStatus:'model_reviewed',completedAt:new Date().toISOString()},nodes:legacy.nodes.map((n,i)=>{
    const value=i===0?2:i===1?1:0;
    return {...n,position:{...n.position,x:value/4,y:2},axisAssessment:{reasoningDepth:{value,rationale:'Fixture internal inference.',anchorIds:n.anchorIds,prerequisiteNodeIds:i===1?[legacy.nodes[0].id]:[]},generality:{value:2,rationale:'Fixture scope.',anchorIds:n.anchorIds}}};
  })});
  let calls=0;
  const generate:Generate=async(_system,prompt,schema)=>{
    calls++;let value:unknown={rejected:[]};
    if(schema===AxisBatchSchema){
      const data=JSON.parse(prompt.split('DATA:\n')[1]);
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
    const bad=structuredClone(result);bad.nodes[1].axisAssessment!.reasoningDepth.value=1;bad.nodes[1].position.x=.25;
    assert.equal(GraphSchema.safeParse(bad).success,false);
    const unknown=structuredClone(result);unknown.nodes[0].axisAssessment!.reasoningDepth.value=null;unknown.nodes[0].position.x=null;
    assert.equal(GraphSchema.safeParse(unknown).success,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
