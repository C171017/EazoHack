import { pipelineStage, measureValidation, countPipeline } from './telemetry';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { BOOK_AXIS_VERSION, axisCoordinate } from '../../shared/book-axes';
import { GraphSchema, type Graph } from '../../shared/schemas';
import type { Generate, ModelReply } from './contracts';
import { AXIS_PROMPT_VERSION, AXIS_SYSTEM, AxisBatchSchema, AxisReviewSchema, axisPrompt, axisReviewPrompt } from './axis-prompts';
import { readJson, writeJson } from './json-store';
import { ModelRequestError } from './vertex';
import { mapConcurrent } from './work-pool';

function preserveSource(result:Graph,base:Graph) {
  for(const key of ['bookId','fileHash','extractionVersion','sourceLength','anchors','identities','edges','territories'] as const) {
    if(JSON.stringify(result[key])!==JSON.stringify(base[key]))throw new Error(`Axis reassessment changed ${key}`);
  }
  const content=(g:Graph)=>g.nodes.map(n=>Object.fromEntries(Object.entries(n).filter(([key])=>!['position','axisAssessment','evidence'].includes(key))));
  if(JSON.stringify(content(result))!==JSON.stringify(content(base))||JSON.stringify(result.nodes.map(n=>n.position.z))!==JSON.stringify(base.nodes.map(n=>n.position.z)))throw new Error('Axis reassessment changed accepted occurrences or source order');
  return result;
}

export function validateAxisBatch(batch:z.infer<typeof AxisBatchSchema>, graph:Graph, targets:Graph['nodes']) {
  const ids=batch.assignments.map(a=>a.nodeId), targetIds=new Set(targets.map(n=>n.id));
  if(ids.length!==targets.length || new Set(ids).size!==ids.length || ids.some(id=>!targetIds.has(id))) throw new Error('Assign every target exactly once');
  const nodes=new Map(graph.nodes.map(n=>[n.id,n])), anchors=new Set(graph.anchors.map(a=>a.id));
  for(const {nodeId,assessment:a} of batch.assignments) {
    const node=nodes.get(nodeId)!;
    for(const rating of [a.reasoningDepth,a.generality]) if(rating.anchorIds.some(id=>!anchors.has(id)) || !rating.anchorIds.some(id=>node.anchorIds.includes(id))) throw new Error(`Invalid axis evidence for ${nodeId}`);
    if(a.reasoningDepth.prerequisiteNodeIds.some(id=>id===nodeId || !nodes.has(id))) throw new Error(`Invalid prerequisite for ${nodeId}`);
    if(a.reasoningDepth.value===0 && a.reasoningDepth.prerequisiteNodeIds.length) throw new Error('Starting points cannot have reasoning prerequisites');
  }
  return batch;
}

// Generates a new staged graph. Publication happens only after the caller's
// hierarchy build succeeds; source occurrences and original relations survive.
export async function assignBookAxes(input: Parameters<typeof assignBookAxesImpl>[0]) {
  return pipelineStage('axes', () => assignBookAxesImpl(input));
}

async function assignBookAxesImpl({graph,outputRoot,generate,model,log=()=>{}}:{graph:Graph;outputRoot:string;generate:Generate;model:string;log?:(message:string)=>void}):Promise<Graph> {
  graph=GraphSchema.parse(graph);
  if(graph.axisVersion===BOOK_AXIS_VERSION && graph.axisAnalysis?.promptVersion===AXIS_PROMPT_VERSION && graph.axisAnalysis.model===model) return graph;
  const fingerprint=createHash('sha256').update(JSON.stringify({graph:{...graph,analysis:graph.analysis?{...graph.analysis,createdAt:undefined}:undefined},model,system:AXIS_SYSTEM,prompt:AXIS_PROMPT_VERSION,schema:z.toJSONSchema(AxisBatchSchema)})).digest('hex').slice(0,16);
  const version=`${AXIS_PROMPT_VERSION}-${fingerprint}`,dir=path.join(outputRoot,version);
  const completed=await readJson(path.join(dir,'graph.json'));
  if(completed) { const saved=preserveSource(GraphSchema.parse(completed),graph); if(saved.graphVersion!==version||saved.axisVersion!==BOOK_AXIS_VERSION)throw new Error('Axis checkpoint version mismatch'); countPipeline('checkpoint.hit');log(`${version}: restored`);return saved; }
  const calls:{key:string;usage:ModelReply['usage'];durationMs:number;modelVersion:string}[]=[];
  async function call<T>(key:string,prompt:string,schema:z.ZodType<T>,validate:(value:T)=>T):Promise<T> {
    const requestHash=createHash('sha256').update(JSON.stringify({system:AXIS_SYSTEM,prompt,model,schema:z.toJSONSchema(schema)})).digest('hex');
    const file=path.join(dir,`${key}.json`),cached=await readJson(file) as ModelReply|null;
    if(cached?.requestHash===requestHash && cached.model===model) { const value=measureValidation(() => validate(schema.parse(cached.value)));calls.push({key,usage:cached.usage,durationMs:cached.durationMs,modelVersion:cached.modelVersion});countPipeline('checkpoint.hit');log(`${key}: restored`);return value; }
    let failure='';
    for(let attempt=1;attempt<=3;attempt++) {
      if (attempt > 1) countPipeline('retry');
      try {
        const reply=await generate(AXIS_SYSTEM,prompt+(failure?`\nCorrect the previous validation failure: ${failure}`:''),schema,16_384);
        reply.requestHash=requestHash;
        await writeJson(path.join(dir,'attempts',`${key}-${Date.now()}-${attempt}.json`),reply);
        const value=measureValidation(() => validate(schema.parse(reply.value)));await writeJson(file,reply);
        calls.push({key,usage:reply.usage,durationMs:reply.durationMs,modelVersion:reply.modelVersion});
        log(`${key}: complete (${Math.round(reply.durationMs/1000)}s)`);return value;
      } catch(error) {
        failure=error instanceof Error?error.message:'Axis analysis failed';
        await writeJson(path.join(dir,'errors',`${key}-${Date.now()}-${attempt}.json`),{error:failure});
        if(error instanceof ModelRequestError&&!error.retryable)throw error;
        if(attempt===3)throw new Error(`${key}: ${failure}`);
      }
    }
    throw new Error('Axis retries exhausted');
  }
  await writeJson(path.join(dir,'manifest.json'),{status:'running',version,sourceGraphVersion:graph.graphVersion,model,axisVersion:BOOK_AXIS_VERSION});
  try {
    const batches=Array.from({length:Math.ceil(graph.nodes.length/24)},(_,i)=>graph.nodes.slice(i*24,(i+1)*24));
    const results=await mapConcurrent(batches,2,async(targets,index)=>{
        const key=`axes-${index+1}`;
        let proposal=await call(key,axisPrompt(graph,targets),AxisBatchSchema,v=>validateAxisBatch(v,graph,targets));
        for(let revision=0;revision<3;revision++) {
          const review=await call(`${key}-review-${revision}`,axisReviewPrompt(graph,targets,proposal),AxisReviewSchema,v=>{
            if(v.rejected.some(r=>!targets.some(n=>n.id===r.nodeId)))throw new Error('Axis review referenced a non-target');return v;
          });
          if(!review.rejected.length)return proposal.assignments;
          if(revision===2)throw new Error(`${key}: axis assignments still fail source review`);
          proposal=await call(`${key}-revision-${revision+1}`,axisReviewPrompt(graph,targets,proposal)+`\nNow return a COMPLETE CORRECTED ASSIGNMENT for every target, including unchanged valid ratings. Findings:\n${JSON.stringify(review)}`,AxisBatchSchema,v=>validateAxisBatch(v,graph,targets));
        }
        throw new Error('Axis review incomplete');
      });
    const assignments=results.flat();
    const byId=new Map(assignments.map(a=>[a.nodeId,a.assessment]));
    const result=GraphSchema.parse({...graph,graphVersion:version,axisVersion:BOOK_AXIS_VERSION,
      axisAnalysis:{model,promptVersion:AXIS_PROMPT_VERSION,sourceGraphVersion:graph.graphVersion,reviewStatus:'model_reviewed',completedAt:new Date().toISOString()},
      nodes:graph.nodes.map(n=>{
        const assessment=byId.get(n.id)!;
        return {...n,axisAssessment:assessment,position:{x:axisCoordinate(assessment.reasoningDepth.value,'x'),y:axisCoordinate(assessment.generality.value,'y'),z:n.position.z},
          evidence:{...n.evidence,ruleVersion:AXIS_PROMPT_VERSION,rationale:`X — ${assessment.reasoningDepth.rationale}\nY — ${assessment.generality.rationale}\nZ derives from the unchanged first exact source anchor. Topics do not determine coordinates.`,anchorIds:[...new Set([...n.anchorIds,...assessment.reasoningDepth.anchorIds,...assessment.generality.anchorIds])]}};
      })});
    preserveSource(result,graph);
    await writeJson(path.join(dir,'graph.json'),result);
    await writeJson(path.join(dir,'manifest.json'),{status:'complete',version,sourceGraphVersion:graph.graphVersion,axisVersion:BOOK_AXIS_VERSION,model,nodes:result.nodes.length,unknown:result.nodes.filter(n=>n.position.x===null||n.position.y===null).length,validatedCalls:calls});
    return result;
  } catch(error) {
    await writeJson(path.join(dir,'manifest.json'),{status:'failed',version,validatedCalls:calls,error:error instanceof Error?error.message:'Axis analysis failed'});throw error;
  }
}
