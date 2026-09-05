import { z } from 'zod';
import type { Graph } from './schemas';

export const ZOOM_POLICY = { version:'zoom-v1', roots:8, children:8, maxDepth:6, nodes:36, transitions:72, edges:64, labels:18, cachePages:48, pageSize:30, duration:260, step:1.8, hysteresis:.86, minZoom:.5, maxZoom:48 } as const;
const Vec = z.object({x:z.number().finite(),y:z.number().finite(),z:z.number().finite()}).strict();
export const MapEntrySchema = z.object({
  id:z.string(), parentId:z.string().nullable(), kind:z.enum(['cluster','occurrence']), label:z.string().min(1).max(500), summary:z.string().max(20_000),
  position:Vec.nullable(), bounds:z.object({min:Vec,max:Vec}).strict().nullable(),
  leafCount:z.number().int().positive(), childCount:z.number().int().min(0).max(ZOOM_POLICY.children), height:z.number().int().min(0).max(ZOOM_POLICY.maxDepth),
  themeIds:z.array(z.string()), roles:z.array(z.string()), sourceLabel:z.string(),
}).strict();
export type MapEntry = z.infer<typeof MapEntrySchema>;
export type Bounds = NonNullable<MapEntry['bounds']>;
export const HierarchySchema = z.object({
  version:z.string(), graphVersion:z.string(), fileHash:z.string(), extractionVersion:z.string(), promptVersion:z.string(), model:z.string(), createdAt:z.string(),
  roots:z.array(z.string()).min(1).max(ZOOM_POLICY.roots), depth:z.number().int().min(0).max(ZOOM_POLICY.maxDepth),
  entries:z.array(MapEntrySchema).min(1), children:z.record(z.string(),z.array(z.string()).min(2).max(ZOOM_POLICY.children)),
  rationale:z.string(),
}).strict();
export type Hierarchy = z.infer<typeof HierarchySchema>;
export type MapBootstrap = Pick<Graph,'bookId'|'graphVersion'|'analysis'> & {
  version:string; roots:MapEntry[]; depth:number; totalNodes:number; unplaced:number; unavailable?:boolean;
  territories:Pick<Graph['territories'][number],'id'|'label'|'centroidX'>[];
};
export type NodeDetail = {node:Graph['nodes'][number]; identity:Graph['identities'][number]; anchors:Graph['anchors']; edges:Graph['edges']; neighbours:{id:string;label:string}[]};
export type MapLink = {id:string;source:string;target:string;type:string;count:number;relationIds:string[]};
export function leafEntry(node:Graph['nodes'][number]):MapEntry {
  const {x,y,z}=node.position;
  const position=x===null||y===null||z===null?null:{x,y,z};
  return {id:node.id,parentId:null,kind:'occurrence',label:node.label,summary:node.summary,position,bounds:position?{min:position,max:position}:null,leafCount:1,childCount:0,height:0,themeIds:node.themeTerritoryIds,roles:node.sourceRole?[node.sourceRole]:[],sourceLabel:node.sourceLabel};
}
export function clusterEntry(id:string,label:string,summary:string,children:MapEntry[]):MapEntry {
  const boxes=children.flatMap(n=>n.bounds?[n.bounds]:[]);
  const bounds=boxes.length?{min:{x:Math.min(...boxes.map(b=>b.min.x)),y:Math.min(...boxes.map(b=>b.min.y)),z:Math.min(...boxes.map(b=>b.min.z))},max:{x:Math.max(...boxes.map(b=>b.max.x)),y:Math.max(...boxes.map(b=>b.max.y)),z:Math.max(...boxes.map(b=>b.max.z))}}:null;
  const position=bounds?{x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2,z:(bounds.min.z+bounds.max.z)/2}:null;
  return {id,parentId:null,kind:'cluster',label,summary,position,bounds,leafCount:children.reduce((sum,n)=>sum+n.leafCount,0),childCount:children.length,height:1+Math.max(...children.map(n=>n.height)),themeIds:[...new Set(children.flatMap(n=>n.themeIds))],roles:[...new Set(children.flatMap(n=>n.roles))],sourceLabel:'Summary of source occurrences'};
}
export function validateHierarchy(input:unknown,graph:Graph):Hierarchy {
  const h=HierarchySchema.parse(input), entries=new Map(h.entries.map(n=>[n.id,n]));
  const fail=(message:string):never=>{throw new Error(`Invalid hierarchy: ${message}`);};
  if(h.graphVersion!==graph.graphVersion||h.fileHash!==graph.fileHash||h.extractionVersion!==graph.extractionVersion)fail('source/version mismatch');
  if(entries.size!==h.entries.length)fail('duplicate IDs');
  const visited=new Set<string>();
  function visit(id:string,parentId:string|null):number {
    if(visited.has(id))fail('cycle or duplicate membership');
    const n=entries.get(id);if(!n) return fail('dangling child');
    visited.add(id);
    if(n.parentId!==parentId)fail('parent mismatch');
    if(n.kind==='occurrence') {
      const leaf=graph.nodes.find(l=>l.id===id);if(!leaf)return fail('unknown leaf');
      if(h.children[id])fail('leaf has children');
      if(JSON.stringify({...n,parentId:null})!==JSON.stringify(leafEntry(leaf)))fail('leaf data changed');
      return 0;
    }
    const ids=h.children[id];if(!ids||ids.length!==n.childCount) return fail('child count mismatch');
    const height=1+Math.max(...ids.map(child=>visit(child,id)));
    const expected=clusterEntry(n.id,n.label,n.summary,ids.map(id=>entries.get(id)!));
    if(JSON.stringify({...n,parentId:null})!==JSON.stringify(expected)||height!==n.height)fail('derived bounds/count/height mismatch');
    return height;
  }
  const depth=Math.max(...h.roots.map(id=>visit(id,null)));
  if(depth!==h.depth||visited.size!==entries.size||graph.nodes.some(n=>!visited.has(n.id))||Object.keys(h.children).some(id=>!entries.has(id)))fail('incomplete coverage or depth');
  return h;
}
