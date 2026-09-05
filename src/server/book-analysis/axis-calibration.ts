import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { GraphSchema, type Graph } from '../../shared/schemas';
import { type Generate, type ModelReply } from './contracts';
import { AXIS_SYSTEM, AxisBatchSchema, AxisReviewSchema, axisContext, axisReviewPrompt } from './axis-prompts';
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

export async function calibrateBookAxes({graph,outputRoot,model,generate,log=()=>{}}:{graph:Graph;outputRoot:string;model:string;generate:Generate;log?:(message:string)=>void}):Promise<Graph> {
  graph=GraphSchema.parse(graph);
  if(!graph.axisVersion)throw new Error('Assess axes before whole-book consistency review');
  if(graph.axisAnalysis?.consistencyVersion===CONSISTENCY_VERSION)return graph;
  const version=`${CONSISTENCY_VERSION}-${createHash('sha256').update(JSON.stringify({graph,model,system:AXIS_SYSTEM,version:CONSISTENCY_VERSION})).digest('hex').slice(0,16)}`,dir=path.join(outputRoot,version);
  const completed=await readJson(path.join(dir,'graph.json')) as Graph|null;
  const records:{key:string;usage:ModelReply['usage'];durationMs:number}[]=[];
  async function call<T>(key:string,prompt:string,schema:z.ZodType<T>,validate:(v:T)=>T):Promise<T> {
    const requestHash=createHash('sha256').update(JSON.stringify({system:AXIS_SYSTEM,prompt,schema:z.toJSONSchema(schema),model})).digest('hex');
    const file=path.join(dir,`${key}.json`),cached=await readJson(file) as ModelReply|null;
    if(cached?.requestHash===requestHash&&cached.model===model){const v=validate(schema.parse(cached.value));records.push({key,usage:cached.usage,durationMs:cached.durationMs});log(`${key}: restored`);return v;}
    let failure='';
    for(let attempt=1;attempt<=3;attempt++) {
      try {
        const reply=await generate(AXIS_SYSTEM,prompt+(failure?`\nCorrect: ${failure}`:''),schema,16_384);reply.requestHash=requestHash;
        await writeJson(path.join(dir,'attempts',`${key}-${Date.now()}-${attempt}.json`),reply);
        const v=validate(schema.parse(reply.value));await writeJson(file,reply);records.push({key,usage:reply.usage,durationMs:reply.durationMs});log(`${key}: complete`);return v;
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
          const ratings=snapshot.nodes.map(n=>({nodeId:n.id,assessment:n.axisAssessment}));
          const prompt=`Calibrate EVERY target's total within-book reasoning depth using the complete current ratings. Do not lower a prerequisite's score by editing another node. If a cited prerequisite is truly required, the dependent cannot have lower total depth; incorporate the prior chain into its rating. Equal scores are allowed for coarse rubric ties and at the upper anchor. If the link is only topical context, a mention, or analogy rather than a required inference, REMOVE that prerequisite with an explanation grounded in the source. If a required prerequisite has unknown depth, use null for the dependent unless the unsupported prerequisite is removed. Never raise scores merely to keep a false dependency.\nAlso inspect positive-depth targets with no prerequisite node: an explicitly introduced definition, assertion or image with no inferential step should be 0. Positive values require explaining actual INTERNAL inference supported by the passage. Introduced material is not automatically 0.5. Preserve generality unless source review shows a concrete error. Return complete corrected assignments for every target.\nDATA:\n${JSON.stringify({...axisContext(snapshot,batch,batch.flatMap(n=>n.axisAssessment!.reasoningDepth.prerequisiteNodeIds)),currentRatings:ratings})}`;
          let proposal=await call(key,prompt,AxisBatchSchema,v=>validateAxisBatch(v,snapshot,batch));
          for(let revision=0;revision<3;revision++) {
            const review=await call(`${key}-review-${revision}`,axisReviewPrompt(snapshot,batch,proposal)+`\nCheck total-depth consistency, not only the last local inference. CURRENT WHOLE-BOOK RATINGS:\n${JSON.stringify(ratings)}`,AxisReviewSchema,v=>{if(v.rejected.some(r=>!batch.some(n=>n.id===r.nodeId)))throw new Error('Review outside targets');return v;});
            if(!review.rejected.length)return proposal;
            if(revision===2)throw new Error(`${key}: consistency corrections failed evidence review`);
            proposal=await call(`${key}-revision-${revision+1}`,prompt+`\nCORRECT PROPOSAL ${JSON.stringify(proposal)}\nFINDINGS ${JSON.stringify(review)}`,AxisBatchSchema,v=>validateAxisBatch(v,snapshot,batch));
          }
          throw new Error('Consistency review incomplete');
        }));
        for(const r of results){if(r.status==='rejected')throw r.reason;for(const a of r.value.assignments)changes.set(a.nodeId,a.assessment);}
      }
      graph=GraphSchema.parse({...graph,nodes:graph.nodes.map(n=>{
        const a=changes.get(n.id);if(!a)return n;
        return {...n,axisAssessment:a,position:{...n.position,x:a.reasoningDepth.value===null?null:a.reasoningDepth.value/4,y:a.generality.value},evidence:{...n.evidence,ruleVersion:CONSISTENCY_VERSION,rationale:`X — ${a.reasoningDepth.rationale}\nY — ${a.generality.rationale}\nZ is the unchanged exact source position.`,anchorIds:[...new Set([...n.anchorIds,...a.reasoningDepth.anchorIds,...a.generality.anchorIds])]}};
      })});
    }
    const result=GraphSchema.parse({...graph,graphVersion:version,axisAnalysis:{...graph.axisAnalysis!,sourceGraphVersion:original.graphVersion,consistencyVersion:CONSISTENCY_VERSION,completedAt:completed?.axisAnalysis?.completedAt??new Date().toISOString()}});
    await writeJson(path.join(dir,'graph.json'),result);
    await writeJson(path.join(dir,'manifest.json'),{status:'complete',version,sourceGraphVersion:original.graphVersion,validatedCalls:records,remainingDepthConflicts:depthInconsistencies(result).length});
    return result;
  }catch(error){await writeJson(path.join(dir,'manifest.json'),{status:'failed',version,validatedCalls:records,error:error instanceof Error?error.message:'Consistency failed'});throw error;}
}
