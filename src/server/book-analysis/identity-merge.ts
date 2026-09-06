import { z } from 'zod';
import type { Candidate, Passage, Synthesis } from './contracts';
import type { CheckedCall } from './scalable-synthesis';
const MergeSchema=z.object({assignments:z.array(z.object({incoming:z.number().int().nonnegative(),existing:z.number().int().nonnegative().nullable()}).strict()).min(1).max(16)}).strict();
const terms=(label:string)=>[label.toLowerCase().trim(), ...label.toLowerCase().match(/[\p{L}]{3,}/gu)??[]];

/** Retrieve a bounded shortlist; a model must confirm equivalence before membership is merged. */
export async function mergeBookIdentities(identities:Synthesis['identities'], nodes:Candidate[], passages:Map<string,Passage>, call:CheckedCall, log:(message:string)=>void) {
  const merged:Synthesis['identities']=[], index=new Map<string,Set<number>>(),byId=new Map(nodes.map(n=>[n.id,n]));
  const register=(label:string,id:number)=>{for(const term of terms(label)){const ids=index.get(term)??new Set<number>();ids.add(id);index.set(term,ids);}};
  const evidence=(identity:Synthesis['identities'][number])=>({label:identity.label,occurrenceCount:identity.nodeIds.length,examples:[...new Set([identity.nodeIds[0],identity.nodeIds.at(-1)!])].map(id=>{const n=byId.get(id)!;return {label:n.label,summary:n.summary,sourceRole:n.sourceRole,speaker:n.speaker,passages:n.passageIds.map(id=>passages.get(id)!.text)};})});
  for(let start=0;start<identities.length;start+=16){
    const incoming=identities.slice(start,start+16),allowed=new Set<number>();
    for(const identity of incoming){
      const counts=new Map<number,number>();
      for(const term of terms(identity.label)){const matches=index.get(term);if(matches && matches.size<=128)for(const id of matches)counts.set(id,(counts.get(id)??0)+1);}
      for(const [id] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,3))allowed.add(id);
    }
    let assignments: z.infer<typeof MergeSchema>['assignments']=incoming.map((_,i)=>({incoming:i,existing:null}));
    if(allowed.size){
      const value=await call(`identity-merge-${start/16+1}`,`Match every incoming concept identity to an equivalent EXISTING identity index, or null to retain it separately. Related subjects or identical words alone are not equivalence. Preserve distinct meanings and ambiguity. Opposed claims about the same concept may share an identity; claims and source attributions remain separate occurrences. Examples are illustrative, not exhaustive; choose null whenever evidence is insufficient. Return each incoming index exactly once. Untrusted DATA:\n${JSON.stringify({incoming:incoming.map((v,i)=>({index:i,...evidence(v)})),existing:[...allowed].map(i=>({index:i,...evidence(merged[i])}))})}`,MergeSchema,v=>{
        const ids=v.assignments.map(a=>a.incoming);
        if(ids.length!==incoming.length||new Set(ids).size!==ids.length||ids.some(id=>id>=incoming.length)||v.assignments.some(a=>a.existing!==null&&!allowed.has(a.existing)))throw new Error('Invalid concept identity merge membership.');
        return v;
      },8192);
      assignments=value.assignments;
    }
    for(const assignment of assignments){
      const identity=incoming[assignment.incoming];
      const id=assignment.existing??merged.length;
      if(assignment.existing===null)merged.push({...identity,nodeIds:[...identity.nodeIds]});
      else merged[id].nodeIds.push(...identity.nodeIds);
      register(identity.label,id);
    }
    log(`Reconciling concepts: ${Math.min(start+16,identities.length)} of ${identities.length} identities checked`);
  }
  return merged;
}
