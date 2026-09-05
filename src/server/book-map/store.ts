import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { GraphSchema, type Graph } from '../../shared/schemas';
import { validateHierarchy, type Hierarchy, type MapBootstrap, type NodeDetail, type MapLink } from '../../shared/zoom-hierarchy';
import { validateGraphSource } from '../book-analysis/graph';
import { getBookPreview } from '../../features/reader/book-preview';
const root=path.join(process.cwd(),'data/books/plato-republic/analysis');
export type MapStore={graph:Graph;hierarchy:Hierarchy;entries:Map<string,Hierarchy['entries'][number]>;descendants:Map<string,Set<string>>};
let cache:{stamp:number;promise:Promise<MapStore>}|undefined;
export function createMapStore(graph:Graph,hierarchy:Hierarchy):MapStore {
  const entries=new Map(hierarchy.entries.map(n=>[n.id,n])),descendants=new Map<string,Set<string>>();
  function leaves(id:string):Set<string>{let found=descendants.get(id);if(!found){found=new Set(hierarchy.children[id]?.flatMap(child=>[...leaves(child)])??[id]);descendants.set(id,found);}return found;}
  hierarchy.roots.forEach(leaves);
  return {graph,hierarchy,entries,descendants};
}
export async function loadMapStore():Promise<MapStore> {
  const pointer=path.join(root,'current-map.json'),stamp=(await stat(pointer)).mtimeMs;
  if(!cache||cache.stamp!==stamp){
    const promise=(async()=>{
      const {version}=JSON.parse(await readFile(pointer,'utf8')) as {version:string};
      if(!/^[a-z0-9-]+$/.test(version))throw new Error('Invalid map version');
      const dir=path.join(root,version);
      const [g,h,preview]=await Promise.all([readFile(path.join(dir,'graph.json'),'utf8'),readFile(path.join(dir,'hierarchy.json'),'utf8'),getBookPreview()]);
      const graph=validateGraphSource(GraphSchema.parse(JSON.parse(g)),preview.sourceText,preview.fileHash);
      if(graph.axisVersion&&!graph.axisAnalysis?.consistencyVersion)throw new Error('Map axes have not passed whole-book consistency review');
      const hierarchy=validateHierarchy(JSON.parse(h),graph);
      return createMapStore(graph,hierarchy);
    })();
    cache={stamp,promise};
    promise.catch(()=>{if(cache?.promise===promise)cache=undefined;});
  }
  return cache.promise;
}
export function mapBootstrap({graph,hierarchy,entries}:MapStore):MapBootstrap {
  return {axisVersion:graph.axisVersion,bookId:graph.bookId,graphVersion:graph.graphVersion,analysis:graph.analysis,version:hierarchy.version,roots:hierarchy.roots.map(id=>entries.get(id)!),depth:hierarchy.depth,totalNodes:graph.nodes.length,unplaced:graph.nodes.filter(n=>Object.values(n.position).includes(null)).length,territories:graph.territories.map(({id,label,centroidX})=>({id,label,centroidX}))};
}
export function nodeDetail({graph}:MapStore,id:string):NodeDetail|null {
  const node=graph.nodes.find(n=>n.id===id);if(!node)return null;
  const identity=graph.identities.find(i=>i.id===node.identityId)!;
  const edges=graph.edges.filter(e=>e.source===id||e.target===id);
  const ids=new Set([...(node.axisAssessment?.reasoningDepth.prerequisiteNodeIds??[]),...identity.occurrenceIds,...edges.flatMap(e=>[e.source,e.target])]);
  const anchors=new Set([...(node.axisAssessment?.reasoningDepth.anchorIds??[]),...(node.axisAssessment?.generality.anchorIds??[]),...node.anchorIds,...edges.flatMap(e=>e.evidenceAnchorIds)]);
  return {node,identity,edges,anchors:graph.anchors.filter(a=>anchors.has(a.id)),neighbours:graph.nodes.filter(n=>ids.has(n.id)).map(({id,label})=>({id,label}))};
}
export function unplacedNotes({graph}:MapStore,offset=0) {
  if(!Number.isInteger(offset)||offset<0)throw new Error('Invalid unplaced offset');
  const nodes=graph.nodes.filter(n=>Object.values(n.position).includes(null));
  return {total:nodes.length,offset,notes:nodes.slice(offset,offset+20).map(({id,label,sourceLabel})=>({id,label,sourceLabel}))};
}
export function visibleLinks(store:MapStore,ids:string[],filter:{theme?:string|null;role?:string|null;start?:number;end?:number}={}):MapLink[] {
  const matching=new Set(store.graph.nodes.filter(n=>(!filter.theme||n.themeTerritoryIds.includes(filter.theme))&&(!filter.role||n.sourceRole===filter.role)&&(n.position.z===null||n.position.z>=(filter.start??0)&&n.position.z<=(filter.end??1))).map(n=>n.id));
  const owners=new Map<string,string>();
  for(const id of ids)for(const leaf of store.descendants.get(id)??[]) {
    if(!matching.has(leaf))continue;
    if(owners.has(leaf))throw new Error('Visible nodes must not overlap');
    owners.set(leaf,id);
  }
  const links=new Map<string,MapLink>();
  for(const e of store.graph.edges){
    const source=owners.get(e.source),target=owners.get(e.target);if(!source||!target||source===target)continue;
    const key=JSON.stringify([source,target,e.type]);
    const link=links.get(key)??{id:key,source,target,type:e.type,count:0,relationIds:[]};
    link.count++;link.relationIds.push(e.id);links.set(key,link);
  }
  return [...links.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
}
