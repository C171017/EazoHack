import { createHash } from 'node:crypto';
import { readJson, writeJson } from './json-store';
import path from 'node:path';
import { z } from 'zod';
import { type Graph } from '../../shared/schemas';
import { ZOOM_POLICY, leafEntry, clusterEntry, validateHierarchy, type MapEntry, type Hierarchy } from '../../shared/zoom-hierarchy';
import type { Generate, ModelReply } from './contracts';
import { HIERARCHY_PROMPT_VERSION, HIERARCHY_SYSTEM, hierarchyPrompt, hierarchyReviewPrompt } from './hierarchy-prompts';
const GroupSchema=z.object({groups:z.array(z.object({childIds:z.array(z.string()).min(1).max(ZOOM_POLICY.children),label:z.string().min(1).max(180),summary:z.string().min(1).max(1800),rationale:z.string().min(1).max(1500)}).strict()).min(1).max(24)}).strict();
const ReviewSchema=z.object({rejected:z.array(z.object({index:z.number().int().nonnegative(),reason:z.string().min(1).max(1500)}).strict())}).strict();
export function validateGroups(value:z.infer<typeof GroupSchema>,nodes:MapEntry[]) {
  const ids=value.groups.flatMap(g=>g.childIds),allowed=new Set(nodes.map(n=>n.id));
  if(ids.length!==nodes.length||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))throw new Error('Partition must contain every supplied ID exactly once.');
  const maxGroups=nodes.length>8?Math.floor(nodes.length*2/3):nodes.length-1;
  if(value.groups.length>maxGroups)throw new Error(`Insufficient reduction: at most ${maxGroups} groups required.`);
  return value;
}
// Partition neighbourhoods by the widest normalized semantic dimension. The LM
// still decides grouping within each neighbourhood; screen projection is unused.
export function spatialBatches(nodes:MapEntry[],limit=24):MapEntry[][] {
  if(nodes.length<=limit)return [nodes];
  const axes=['x','y','z'] as const;
  const span=(axis:typeof axes[number])=>{const values=nodes.map(n=>(n.position?.[axis]??0)/(axis==='y'?4:1));return Math.max(...values)-Math.min(...values);};
  const axis=[...axes].sort((a,b)=>span(b)-span(a))[0];
  const sorted=[...nodes].sort((a,b)=>(a.position?.[axis]??-1)-(b.position?.[axis]??-1)||a.id.localeCompare(b.id));
  const mid=Math.floor(sorted.length/2);return [...spatialBatches(sorted.slice(0,mid),limit),...spatialBatches(sorted.slice(mid),limit)];
}
export async function buildHierarchy({graph,outputRoot,generate,model,log=()=>{}}:{graph:Graph;outputRoot:string;generate:Generate;model:string;log?:(message:string)=>void}) {
  if(graph.axisVersion&&!graph.axisAnalysis?.consistencyVersion)throw new Error('Complete the whole-book axis consistency review before building a published map');
  const fingerprint=createHash('sha256').update(JSON.stringify({graph,model,prompt:HIERARCHY_PROMPT_VERSION,system:HIERARCHY_SYSTEM,policy:ZOOM_POLICY.version})).digest('hex').slice(0,16);
  const version=`${HIERARCHY_PROMPT_VERSION}-${fingerprint}`,dir=path.join(outputRoot,version);
  const completed=await readJson(path.join(dir,'hierarchy.json'));
  if(completed){const hierarchy=validateHierarchy(completed,graph);await writeJson(path.join(outputRoot,'current-map.json'),{version});log(`Restored ${version}: ${hierarchy.depth+1} layers`);return hierarchy;}
  const calls:{key:string;usage:ModelReply['usage'];durationMs:number;responseId?:string}[]=[];
  async function call<T>(key:string,prompt:string,schema:z.ZodType<T>,validate:(value:T)=>T):Promise<T> {
    const requestHash=createHash('sha256').update(JSON.stringify({prompt,system:HIERARCHY_SYSTEM,schema:z.toJSONSchema(schema),model})).digest('hex');
    const cached=await readJson(path.join(dir,`${key}.json`)) as ModelReply|null;
    if(cached?.requestHash===requestHash){const value=validate(schema.parse(cached.value));calls.push({key,usage:cached.usage,durationMs:cached.durationMs,responseId:cached.responseId});log(`${key}: restored`);return value;}
    let failure='';
    for(let attempt=1;attempt<=3;attempt++) {
      try {
        const reply=await generate(HIERARCHY_SYSTEM,prompt+(failure?`\nCorrect the previous validation failure: ${failure}`:''),schema,8192);reply.requestHash=requestHash;
        await writeJson(path.join(dir,'attempts',`${key}-${Date.now()}-${attempt}.json`),reply);
        const value=validate(schema.parse(reply.value));await writeJson(path.join(dir,`${key}.json`),reply);
        calls.push({key,usage:reply.usage,durationMs:reply.durationMs,responseId:reply.responseId});log(`${key}: complete (${Math.round(reply.durationMs/1000)}s)`);return value;
      }catch(error){failure=error instanceof Error?error.message:'Hierarchy request failed';await writeJson(path.join(dir,'errors',`${key}-${Date.now()}-${attempt}.json`),{error:failure});if(attempt===3)throw new Error(`${key}: ${failure}`);}
    }
    throw new Error('Retries exhausted');
  }
  const entries=new Map(graph.nodes.map(n=>[n.id,leafEntry(n)])),children:Record<string,string[]>={},leafIds=new Map(graph.nodes.map(n=>[n.id,[n.id]]));
  const sourceNodes=new Map(graph.nodes.map(n=>[n.id,n])),anchors=new Map(graph.anchors.map(a=>[a.id,a]));
  let frontier=[...entries.values()],level=0;
  await writeJson(path.join(dir,'manifest.json'),{status:'running',graphVersion:graph.graphVersion,version,phase:'grouping'});
  try {
    while(frontier.length>ZOOM_POLICY.roots) {
      level++;if(level>ZOOM_POLICY.maxDepth)throw new Error('Hierarchy exceeds the depth budget; revise grouping, do not discard leaves.');
      const batches=spatialBatches(frontier),next:MapEntry[]=[];
      // Two bounded concurrent provider calls; complete a whole level before the next.
      for(let start=0;start<batches.length;start+=2) {
        const results=await Promise.allSettled(batches.slice(start,start+2).map(async(nodes,offset)=>{
          const batch=start+offset,key=`level-${level}-batch-${batch+1}`;
          const leafSet=new Set(nodes.flatMap(n=>leafIds.get(n.id)!));
          const evidence=[...leafSet].map(id=>{const n=sourceNodes.get(id)!;return {id,label:n.label,sourceRole:n.sourceRole,speaker:n.speaker,passages:n.anchorIds.map(id=>({id,quote:anchors.get(id)!.quote}))};});
          let groups=await call(key,hierarchyPrompt(nodes,level,evidence),GroupSchema,v=>validateGroups(v,nodes));
          for(let revision=0;revision<3;revision++) {
            const review=await call(`${key}-review-${revision}`,hierarchyReviewPrompt(groups.groups,nodes,evidence),ReviewSchema,v=>{if(v.rejected.some(r=>r.index>=groups.groups.length))throw new Error('Review index outside groups');return v;});
            if(!review.rejected.length)return {groups:groups.groups,key};
            if(revision===2)throw new Error(`${key}: group summaries still fail evidence review`);
            groups=await call(`${key}-revision-${revision+1}`,hierarchyPrompt(nodes,level,evidence)+`\nRejected proposal:\n${JSON.stringify(groups)}\nReview findings to correct:\n${JSON.stringify(review)}`,GroupSchema,v=>validateGroups(v,nodes));
          }
          throw new Error('Review incomplete');
        }));
        for(const result of results) {
          if(result.status==='rejected')throw result.reason;
          const {groups,key}=result.value;
          for(const [i,g] of groups.entries()) {
            if(g.childIds.length===1){next.push(entries.get(g.childIds[0])!);continue;}
            const id=`h-${key}-${i+1}`,members=g.childIds.map(id=>entries.get(id)!);
            const parent=clusterEntry(id,g.label,g.summary,members,graph.axisVersion?'representative-v1':undefined);
            for(const child of members)child.parentId=id;
            entries.set(id,parent);children[id]=g.childIds;leafIds.set(id,g.childIds.flatMap(id=>leafIds.get(id)!));next.push(parent);
          }
        }
      }
      log(`Layer ${level}: ${frontier.length} → ${next.length} summaries; all ${graph.nodes.length} leaves retained.`);frontier=next;
    }
    const hierarchy:Hierarchy=validateHierarchy({version,graphVersion:graph.graphVersion,fileHash:graph.fileHash,extractionVersion:graph.extractionVersion,promptVersion:HIERARCHY_PROMPT_VERSION,model,createdAt:new Date().toISOString(),roots:frontier.map(n=>n.id),depth:Math.max(...frontier.map(n=>n.height)),entries:[...entries.values()],children,rationale:'LM chooses coherent groups in locked spatial neighbourhoods; code repeats until at most eight roots, with at most eight children per parent. Every parent passes a separate source-evidence model review.'},graph);
    await writeJson(path.join(dir,'graph.json'),graph);
    await writeJson(path.join(dir,'hierarchy.json'),hierarchy);
    await writeJson(path.join(dir,'manifest.json'),{status:'complete',version,graphVersion:graph.graphVersion,depth:hierarchy.depth,leafCount:graph.nodes.length,clusterCount:hierarchy.entries.length-graph.nodes.length,rootCount:hierarchy.roots.length,validatedCalls:calls,completedAt:new Date().toISOString()});
    await writeJson(path.join(outputRoot,'current-map.json'),{version});
    log(`Published ${version}: ${hierarchy.depth+1} layers, ${hierarchy.roots.length} roots.`);return hierarchy;
  }catch(error){await writeJson(path.join(dir,'manifest.json'),{status:'failed',version,graphVersion:graph.graphVersion,validatedCalls:calls,error:error instanceof Error?error.message:'Failed',updatedAt:new Date().toISOString()});throw error;}
}
