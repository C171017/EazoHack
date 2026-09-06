import { pipelineStage, measureValidation, countPipeline } from './telemetry';
import { BOOK_AXIS_VERSION, axisCoordinate, axisMaximum } from '../../shared/book-axes';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { GraphSchema, type Graph } from '../../shared/schemas';
import { type Generate, type ModelReply } from './contracts';
import { AXIS_SYSTEM, AxisBatchSchema, AxisReviewSchema, axisContext, contextRatings, axisReviewPrompt } from './axis-prompts';
import { validateAxisBatch } from './axis-run';
import { readJson, writeJson } from './json-store';
import { ModelRequestError } from './vertex';
export const CONSISTENCY_VERSION='axis-consistency-v1' as const;
export function depthInconsistencies(graph:Graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  return graph.nodes.filter(n=>{
    const a=n.axisAssessment?.reasoningDepth;if(!a||a.value===null)return false;
    return a.prerequisiteNodeIds.some(id=>{const v=nodes.get(id)?.axisAssessment?.reasoningDepth.value;return v===null||(v!==undefined&&v>a.value!);});
  });
}
export function requiredDepthFloors(graph:Graph) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])),values=new Map<string,number|null>();
  function floor(id:string):number|null {
    if(values.has(id))return values.get(id)!;
    const a=nodes.get(id)!.axisAssessment!.reasoningDepth;
    const prerequisites=a.prerequisiteNodeIds.map(floor);
    const value=a.value===null||prerequisites.includes(null)?null:Math.max(a.value,...prerequisites as number[]);
    values.set(id,value);return value;
  }
  for(const id of nodes.keys())floor(id);return values;
}

export async function calibrateBookAxes(input: Parameters<typeof calibrateBookAxesImpl>[0]) {
  return pipelineStage('calibration', () => calibrateBookAxesImpl(input));
}

async function calibrateBookAxesImpl({graph,outputRoot,model,generate,log=()=>{}}:{graph:Graph;outputRoot:string;model:string;generate:Generate;log?:(message:string)=>void}):Promise<Graph> {
  graph=GraphSchema.parse(graph);
  if(graph.axisVersion!==BOOK_AXIS_VERSION)throw new Error('Reassess axes with the current rubric before whole-book consistency review');
  if(graph.axisAnalysis?.consistencyVersion===CONSISTENCY_VERSION)return graph;
  const version=`${CONSISTENCY_VERSION}-${createHash('sha256').update(JSON.stringify({graph,model,system:AXIS_SYSTEM,version:CONSISTENCY_VERSION})).digest('hex').slice(0,16)}`,dir=path.join(outputRoot,version);
  const completed=await readJson(path.join(dir,'graph.json')) as Graph|null;
  const records:{key:string;usage:ModelReply['usage'];durationMs:number}[]=[];
  async function call<T>(key:string,prompt:string,schema:z.ZodType<T>,validate:(v:T)=>T):Promise<T> {
    const requestHash=createHash('sha256').update(JSON.stringify({system:AXIS_SYSTEM,prompt,schema:z.toJSONSchema(schema),model})).digest('hex');
    const file=path.join(dir,`${key}.json`),cached=await readJson(file) as ModelReply|null;
    if(cached?.requestHash===requestHash&&cached.model===model){const v=measureValidation(() => validate(schema.parse(cached.value)));records.push({key,usage:cached.usage,durationMs:cached.durationMs});countPipeline('checkpoint.hit');log(`${key}: restored`);return v;}
    let failure='';
    for(let attempt=1;attempt<=3;attempt++) {
      if (attempt > 1) countPipeline('retry');
      try {
        const reply=await generate(AXIS_SYSTEM,prompt+(failure?`\nCorrect: ${failure}`:''),schema,16_384);reply.requestHash=requestHash;
        await writeJson(path.join(dir,'attempts',`${key}-${Date.now()}-${attempt}.json`),reply);
        const v=measureValidation(() => validate(schema.parse(reply.value)));await writeJson(file,reply);records.push({key,usage:reply.usage,durationMs:reply.durationMs});log(`${key}: complete`);return v;
      }catch(error){failure=error instanceof Error?error.message:'Consistency review failed';if(error instanceof ModelRequestError&&!error.retryable)throw error;if(attempt===3)throw error;}
    }
    throw new Error('Consistency retries exhausted');
  }
  const original=graph;
  await writeJson(path.join(dir,'manifest.json'),{status:'running',version,sourceGraphVersion:graph.graphVersion});
  try {
    // Replaying accepted checkpoints is cheap and verifies every patch against
    // the exact previous state. Never trust a cached final graph to alter source.
    for(let pass=0;pass<4;pass++) {
      const inconsistent=new Set(depthInconsistencies(graph).map(n=>n.id));
      const targets=graph.nodes.filter(n=>inconsistent.has(n.id)||(pass===0&&n.axisAssessment!.reasoningDepth.value!==null&&n.axisAssessment!.reasoningDepth.value!>0&&!n.axisAssessment!.reasoningDepth.prerequisiteNodeIds.length));
      if(!targets.length)break;
      log(`Whole-book consistency pass ${pass+1}: ${targets.length} targets (${inconsistent.size} depth conflicts).`);
      const snapshot=graph,changes=new Map<string,z.infer<typeof AxisBatchSchema>['assignments'][number]['assessment']>();
      const batches=Array.from({length:Math.ceil(targets.length/24)},(_,i)=>targets.slice(i*24,(i+1)*24));
      for(let start=0;start<batches.length;start+=2) {
        const results=await Promise.allSettled(batches.slice(start,start+2).map(async(batch,offset)=>{
          const key=`consistency-${pass+1}-${start+offset+1}`;
          const ratings=contextRatings(snapshot,batch);
          const prompt=`Calibrate EVERY target's total within-book reasoning depth using the retrieved current ratings. Do not lower a prerequisite's score by editing another node. If a cited prerequisite is truly required, the dependent cannot have lower total depth; incorporate the prior chain into its rating. Equal scores are allowed for source-supported ties and at the upper anchor. If the link is only topical context, a mention, or analogy rather than a required inference, REMOVE that prerequisite with an explanation grounded in the source. If a required prerequisite has unknown depth, use null for the dependent unless the unsupported prerequisite is removed. Never raise scores merely to keep a false dependency.\nAlso inspect positive-depth targets with no prerequisite node: an explicitly introduced definition, assertion or image with no inferential step should be 0. Positive values require explaining actual INTERNAL inference supported by the passage. Introduced material is not automatically 0.5. Preserve generality unless source review shows a concrete error. Return complete corrected assignments for every target.\nDATA:\n${JSON.stringify({...axisContext(snapshot,batch,batch.flatMap(n=>n.axisAssessment!.reasoningDepth.prerequisiteNodeIds)),currentRatings:ratings})}`;
          let proposal=await call(key,prompt,AxisBatchSchema,v=>validateAxisBatch(v,snapshot,batch));
          for(let revision=0;revision<3;revision++) {
            const review=await call(`${key}-review-${revision}`,axisReviewPrompt(snapshot,batch,proposal)+`\nThis is a CORRECTION stage. Earlier target ratings are provisional and may be wrong; never reject a corrected number because it differs from an earlier rating. Evaluate the proposed graph below. Reasoning depth includes REQUIRED PRIOR CHAINS: a single new step using an actual prerequisite does not reset the total depth to a local-inference anchor. Source-supported ties are allowed; strict increases or addition of decimal increments are NOT required. An analogy or commentary may be self-contained: in that case reject an unsupported prerequisite instead of demanding a lower score while retaining that prerequisite. Judge the textual relationship first, then total depth. PROPOSED RETRIEVED RATINGS:\n${JSON.stringify(ratings.map(r=>proposal.assignments.find(a=>a.nodeId===r.nodeId)??r))}`,AxisReviewSchema,v=>{if(v.rejected.some(r=>!batch.some(n=>n.id===r.nodeId)))throw new Error('Review outside targets');return v;});
            if(!review.rejected.length)return proposal;
            if(revision===2) {
              const reasons=new Map(review.rejected.map(r=>[r.nodeId,r.reason]));
              // Preserve source nodes when repeated semantic review cannot agree.
              // Only unresolved assignments become explicitly unknown.
              return {assignments:proposal.assignments.map(a=>{const reason=reasons.get(a.nodeId);if(!reason)return a;return {...a,assessment:{reasoningDepth:{value:null,rationale:`Uncertain after bounded source review: ${reason}`.slice(0,1500),anchorIds:snapshot.nodes.find(n=>n.id===a.nodeId)!.anchorIds,prerequisiteNodeIds:[]},generality:{...a.assessment.generality,value:null,rationale:'Coordinate assignment remains uncertain after source review; inspect the original passage.'}}};})};
            }
            proposal=await call(`${key}-revision-${revision+1}`,prompt+`\nCORRECT PROPOSAL ${JSON.stringify(proposal)}\nFINDINGS ${JSON.stringify(review)}`,AxisBatchSchema,v=>validateAxisBatch(v,snapshot,batch));
          }
          throw new Error('Consistency review incomplete');
        }));
        for(const r of results){if(r.status==='rejected')throw r.reason;for(const a of r.value.assignments)changes.set(a.nodeId,a.assessment);}
      }
      graph=GraphSchema.parse({...graph,nodes:graph.nodes.map(n=>{
        const a=changes.get(n.id);if(!a)return n;
        return {...n,axisAssessment:a,position:{...n.position,x:axisCoordinate(a.reasoningDepth.value,'x'),y:axisCoordinate(a.generality.value,'y')},evidence:{...n.evidence,ruleVersion:CONSISTENCY_VERSION,rationale:`X — ${a.reasoningDepth.rationale}\nY — ${a.generality.rationale}\nZ is the unchanged exact source position.`,anchorIds:[...new Set([...n.anchorIds,...a.reasoningDepth.anchorIds,...a.generality.anchorIds])]}};
      })});
    }
    // Resolve propagation across long chains in one topological pass. This is
    // a lower bound from already reviewed ratings, not a new inferred edge or
    // an extra arbitrary increment. Independently review every raised rating.
    const floors=requiredDepthFloors(graph);
    const raised=graph.nodes.filter(n=>floors.get(n.id)!==null && n.axisAssessment!.reasoningDepth.value!==null && floors.get(n.id)!>n.axisAssessment!.reasoningDepth.value!);
    if(raised.length) {
      let proposalGraph:Graph={...graph,nodes:graph.nodes.map(n=>!raised.some(r=>r.id===n.id)?n:{...n,position:{...n.position,x:axisCoordinate(floors.get(n.id)!,'x')},axisAssessment:{...n.axisAssessment!,reasoningDepth:{...n.axisAssessment!.reasoningDepth,value:floors.get(n.id)!,rationale:`Includes the required prior chain, whose reviewed depth sets a lower bound of ${floors.get(n.id)} / ${axisMaximum(graph.axisVersion)}. ${n.axisAssessment!.reasoningDepth.rationale}`.slice(0,1500)}}})};
      const rejected=new Map<string,string>();
      for(let start=0;start<raised.length;start+=24) {
        const initialTargets=proposalGraph.nodes.filter(n=>raised.slice(start,start+24).some(r=>r.id===n.id));
        // A propagated floor can supersede numbers embedded in the old prose.
        // Refresh the explanation before review; stale prose is not uncertainty
        // about the source. Scores, prerequisites and evidence stay locked.
        const repaired=await call(`chain-rationales-${start/24+1}`,`Rewrite ONLY each target's reasoningDepth.rationale to explain its CURRENT proposed total depth and supported prerequisites. Earlier scores quoted inside the old rationale are superseded: remove or correct every stale numeric reference. Preserve the qualitative source reasoning. Do not append a new number to a contradictory old explanation. Every other field, including both values, anchorIds, prerequisiteNodeIds and the complete generality assessment, MUST be copied exactly. Return complete assignments for EVERY target. A separate reviewer will validate these against the actual passages.\nDATA:\n${JSON.stringify({...axisContext(proposalGraph,initialTargets,initialTargets.flatMap(n=>n.axisAssessment!.reasoningDepth.prerequisiteNodeIds)),currentRatings:contextRatings(proposalGraph,initialTargets)})}`,AxisBatchSchema,v=>{
          validateAxisBatch(v,proposalGraph,initialTargets);
          for(const a of v.assignments) {
            const expected=proposalGraph.nodes.find(n=>n.id===a.nodeId)!.axisAssessment!;
            const unchanged={...a.assessment,reasoningDepth:{...a.assessment.reasoningDepth,rationale:expected.reasoningDepth.rationale}};
            if(JSON.stringify(unchanged)!==JSON.stringify(expected))throw new Error('Explanation repair must preserve scores, prerequisites and evidence');
          }
          return v;
        });
        const explanations=new Map(repaired.assignments.map(a=>[a.nodeId,a.assessment]));
        proposalGraph={...proposalGraph,nodes:proposalGraph.nodes.map(n=>({...n,axisAssessment:explanations.get(n.id)??n.axisAssessment}))};
        const targets=proposalGraph.nodes.filter(n=>explanations.has(n.id));
        const proposal={assignments:targets.map(n=>({nodeId:n.id,assessment:n.axisAssessment!}))};
        const review=await call(`chain-closure-${start/24+1}`,axisReviewPrompt(proposalGraph,targets,proposal)+`\nThe application propagated the minimum total-depth band along already reviewed prerequisites. It added no edges or arbitrary numeric increments. Judge whether the prerequisites are supported. A last local step does not erase required prior reasoning. Earlier target scores were provisional, not evidence. If a required link or resulting lower bound cannot be justified, reject that target for an unknown coordinate rather than insisting on inconsistent numbers. PROPOSED RATINGS:\n${JSON.stringify(contextRatings(proposalGraph,targets))}`,AxisReviewSchema,v=>{if(v.rejected.some(r=>!targets.some(n=>n.id===r.nodeId)))throw new Error('Closure review outside targets');return v;});
        for(const r of review.rejected)rejected.set(r.nodeId,r.reason);
      }
      graph=GraphSchema.parse({...proposalGraph,nodes:proposalGraph.nodes.map(n=>{
        const reason=rejected.get(n.id);
        const assessment=reason?{...n.axisAssessment!,reasoningDepth:{...n.axisAssessment!.reasoningDepth,value:null,rationale:`Uncertain after chain review: ${reason}`.slice(0,1500),prerequisiteNodeIds:[]}}:n.axisAssessment!;
        return {...n,axisAssessment:assessment,position:{...n.position,x:axisCoordinate(assessment.reasoningDepth.value,'x')},evidence:{...n.evidence,rationale:`X — ${assessment.reasoningDepth.rationale}\nY — ${assessment.generality.rationale}\nZ is the unchanged source position.`}};
      })});
    }
    for(let remaining=depthInconsistencies(graph);remaining.length;remaining=depthInconsistencies(graph)) {
      const ids=new Set(remaining.map(n=>n.id));
      graph={...graph,nodes:graph.nodes.map(n=>!ids.has(n.id)?n:{...n,position:{...n.position,x:null},axisAssessment:{...n.axisAssessment!,reasoningDepth:{...n.axisAssessment!.reasoningDepth,value:null,rationale:'Total reasoning depth remains uncertain after whole-book review because a required prerequisite has an unresolved or inconsistent depth.'}}})};
    }
    const result=GraphSchema.parse({...graph,graphVersion:version,axisAnalysis:{...graph.axisAnalysis!,sourceGraphVersion:original.graphVersion,consistencyVersion:CONSISTENCY_VERSION,completedAt:completed?.axisAnalysis?.completedAt??new Date().toISOString()}});
    await writeJson(path.join(dir,'graph.json'),result);
    await writeJson(path.join(dir,'manifest.json'),{status:'complete',version,sourceGraphVersion:original.graphVersion,validatedCalls:records,remainingDepthConflicts:depthInconsistencies(result).length});
    return result;
  }catch(error){await writeJson(path.join(dir,'manifest.json'),{status:'failed',version,validatedCalls:records,error:error instanceof Error?error.message:'Consistency failed'});throw error;}
}
