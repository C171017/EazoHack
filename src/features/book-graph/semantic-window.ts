import type { MapView } from '../../shared/schemas';
import { ZOOM_POLICY, type MapEntry, type Bounds } from '../../shared/zoom-hierarchy';
import { project, sourceWorld, type Point3 } from './projection';
export type Size={width:number;height:number};
export function baseScale(size:Size) { return Math.max(.08,Math.min((size.width-180)/660,(size.height-100)/500)); }
export const toWorld = sourceWorld;
export function toScreen(p:Point3,view:MapView,size:Size,range:[number,number],readingProgress=.5) {
  const q=project(toWorld(p,range,readingProgress),view),scale=baseScale(size)*view.zoom;
  return {x:size.width/2+q.x*scale+view.x,y:size.height/2+q.y*scale+view.y};
}
export function zoomAt(view:MapView,zoom:number,focus:{x:number;y:number},size:Size):MapView {
  const next=Math.max(ZOOM_POLICY.minZoom,Math.min(ZOOM_POLICY.maxZoom,zoom)),ratio=next/view.zoom;
  return {...view,zoom:next,x:focus.x-size.width/2-(focus.x-size.width/2-view.x)*ratio,y:focus.y-size.height/2-(focus.y-size.height/2-view.y)*ratio};
}
// Manual zoom always anchors the viewport centre. Recover the centred overview
// progressively on zoom-out, including views previously panned or explicitly located.
export function zoomCentered(view:MapView,zoom:number,size:Size):MapView {
  const next=zoomAt(view,zoom,{x:size.width/2,y:size.height/2},size);
  if(next.zoom<=ZOOM_POLICY.minZoom)return {...next,x:0,y:0};
  if(next.zoom<view.zoom){
    const recovery=(next.zoom-ZOOM_POLICY.minZoom)/(view.zoom-ZOOM_POLICY.minZoom);
    return {...next,x:view.x*recovery,y:view.y*recovery};
  }
  return next;
}
export function zoomLevel(zoom:number,previous:number,maxDepth:number) {
  let level=previous;
  while(level<maxDepth&&zoom>=ZOOM_POLICY.step**(level+1))level++;
  while(level>0&&zoom<ZOOM_POLICY.step**level*ZOOM_POLICY.hysteresis)level--;
  return Math.min(level,maxDepth);
}
function intersects(bounds:Bounds,view:MapView,size:Size,range:[number,number],pad=0,readingProgress=.5) {
  const corners=[bounds.min.x,bounds.max.x].flatMap(x=>[bounds.min.y,bounds.max.y].flatMap(y=>[bounds.min.z,bounds.max.z].map(z=>toScreen({x,y,z},view,size,range,readingProgress))));
  return Math.max(...corners.map(p=>p.x))>=-pad&&Math.min(...corners.map(p=>p.x))<=size.width+pad&&Math.max(...corners.map(p=>p.y))>=-pad&&Math.min(...corners.map(p=>p.y))<=size.height+pad;
}
export function matchesEntry(n:MapEntry,view:MapView,range:[number,number]) {
  return (!view.themeFilter||n.themeIds.includes(view.themeFilter))&&(!view.roleFilter||n.roles.includes(view.roleFilter))&&(!n.bounds||n.bounds.max.z>=range[0]&&n.bounds.min.z<=range[1]);
}
// Traverse cached intersecting branches only. The frontier is a non-overlapping cut:
// budgets retain a parent instead of dropping siblings. Missing pages retain parents.
export function semanticWindow(roots:MapEntry[],pages:ReadonlyMap<string,MapEntry[]>,view:MapView,size:Size,range:[number,number],level:number,readingProgress=.5) {
  const cap=Math.min(ZOOM_POLICY.nodes,level===0?8:level===1?20:36);
  const wanted:string[]=[], used:string[]=[];
  const visible=(n:MapEntry)=>matchesEntry(n,view,range)&&n.bounds!==null&&intersects(n.bounds,view,size,range,0,readingProgress);
  const selectedPath=new Set<string>();
  if(view.selectedNodeId){
    const parents=new Map([...pages.values()].flat().map(n=>[n.id,n.parentId]));
    let id:string|null|undefined=view.selectedNodeId;while(id){selectedPath.add(id);id=parents.get(id);}
  }
  const prioritize=(a:MapEntry,b:MapEntry)=>Number(selectedPath.has(b.id))-Number(selectedPath.has(a.id));
  const frontier=roots.filter(visible).sort(prioritize).map(node=>({node,depth:0}));
  for(let i=0;i<frontier.length;i++) {
    const {node,depth}=frontier[i];
    if(node.kind!=='cluster'||depth>=level)continue;
    const children=pages.get(node.id);
    if(!children){wanted.push(node.id);continue;}
    used.push(node.id);
    const next=children.filter(visible).sort(prioritize);
    if(frontier.length-1+next.length>cap)continue;
    frontier.splice(i,1,...next.map(node=>({node,depth:depth+1})));i--;
  }
  // A cluster bounds may intersect while its representative is outside. Keep
  // traversing its visible children; the renderer never changes source height.
  return {nodes:frontier.map(n=>n.node),wanted,used,cap};
}
export class PageCache {
  readonly pages=new Map<string,MapEntry[]>();
  constructor(readonly capacity:number=ZOOM_POLICY.cachePages){}
  put(id:string,nodes:MapEntry[],protectedIds:ReadonlySet<string>=new Set()) {
    this.pages.delete(id);this.pages.set(id,nodes);
    for(const key of this.pages.keys()) {
      if(this.pages.size<=this.capacity)break;
      if(!protectedIds.has(key))this.pages.delete(key);
    }
    // Protection must itself be bounded; never silently exceed memory budget.
    while(this.pages.size>this.capacity)this.pages.delete(this.pages.keys().next().value!);
  }
  touch(ids:string[]) {for(const id of ids){const page=this.pages.get(id);if(page){this.pages.delete(id);this.pages.set(id,page);}}}
}
