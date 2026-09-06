import type { MapView } from '../../shared/schemas';
import { ZOOM_POLICY, type MapEntry, type Bounds } from '../../shared/zoom-hierarchy';
import { DEFAULT_CAMERA, sourceWorld, type Point3 } from './projection';
import { fitEntries, screenWorld, type Size } from './map-framing';
export { baseScale, type Size } from './map-framing';
export const toWorld = sourceWorld;
export function toScreen(p:Point3,view:MapView,size:Size,range:[number,number],readingProgress=.5) {
  return screenWorld(toWorld(p,range,readingProgress),view,size);
}
export function zoomAt(view:MapView,zoom:number,focus:{x:number;y:number},size:Size):MapView {
  const next=Math.max(ZOOM_POLICY.minZoom,Math.min(ZOOM_POLICY.maxZoom,zoom)),ratio=next/view.zoom;
  return {...view,zoom:next,x:focus.x-size.width/2-(focus.x-size.width/2-view.x)*ratio,y:focus.y-size.height/2-(focus.y-size.height/2-view.y)*ratio};
}
// Manual zoom always anchors the viewport centre. Recover the centred overview
// progressively on zoom-out, including views previously panned or explicitly located.
export function zoomCentered(view:MapView,zoom:number,size:Size,roots?:MapEntry[],readingProgress=.5):MapView {
  const next=zoomAt(view,zoom,{x:size.width/2,y:size.height/2},size);
  // Framing is a second scale, and older projection changes could fit a tiny
  // subtree into it. Recover the full-book frame as well as the numeric zoom.
  let overview:MapView['framing'];
  if(roots&&zoom<view.zoom){
    const base={...view,zoom:ZOOM_POLICY.minZoom,selectedNodeId:null};
    const fitted=fitEntries(roots,base,size,readingProgress).framing;
    const standard=fitEntries(roots,{...base,...DEFAULT_CAMERA,projection:'3d'},size,readingProgress).framing;
    // Flat projections may compress the book into a narrow band. They must
    // not magnify that band into a new, tighter minimum scale.
    if(fitted&&standard)overview={...fitted,scale:Math.min(fitted.scale,standard.scale)};
  }
  if(next.zoom<=ZOOM_POLICY.minZoom)return {...next,x:0,y:0,...(overview?{framing:overview}:{})};
  if(next.zoom<view.zoom){
    const recovery=(next.zoom-ZOOM_POLICY.minZoom)/(view.zoom-ZOOM_POLICY.minZoom);
    const from=view.framing;
    const framing=from&&overview?{scale:overview.scale+(from.scale-overview.scale)*recovery,center:{x:overview.center.x+(from.center.x-overview.center.x)*recovery,y:overview.center.y+(from.center.y-overview.center.y)*recovery,z:overview.center.z+(from.center.z-overview.center.z)*recovery}}:next.framing;
    return {...next,x:view.x*recovery,y:view.y*recovery,framing};
  }
  return next;
}
function depthThreshold(level:number,maxDepth:number) {
  return maxDepth>6 ? ZOOM_POLICY.minZoom * (ZOOM_POLICY.maxZoom / ZOOM_POLICY.minZoom) ** (level / maxDepth) : ZOOM_POLICY.step ** level;
}
export function zoomLevel(zoom:number,previous:number,maxDepth:number) {
  let level=previous;
  while(level<maxDepth&&zoom>=depthThreshold(level+1,maxDepth)-1e-8)level++;
  while(level>0&&zoom<depthThreshold(level,maxDepth)*ZOOM_POLICY.hysteresis)level--;
  return Math.min(level,maxDepth);
}
// Navigate through the existing world: never refit children, which would cancel
// the magnification. The representative stays above the overlaid inspector.
export function zoomIntoGroup(node:MapEntry,view:MapView,size:Size,depth:number,readingProgress:number,totalDepth=6):MapView {
  const step=Math.min(ZOOM_POLICY.step,ZOOM_POLICY.maxZoom ** (1 / Math.max(1,totalDepth)));
  const zoom=Math.min(ZOOM_POLICY.maxZoom,Math.max(view.zoom*step,depthThreshold(depth+1,totalDepth)*1.04));
  const next={...view,zoom,selectedNodeId:node.id};
  if(!node.position)return next;
  const point=toScreen(node.position,next,size,[0,1],readingProgress);
  return {...next,x:next.x+size.width/2-point.x,y:next.y+Math.max(60,(size.height-300)/2)-point.y};
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
  const cap=Math.min(ZOOM_POLICY.nodes,Math.max(8,Math.floor(size.width*size.height/18000)),level===0?12:level===1?20:36);
  const wanted:string[]=[], used:string[]=[],expanded:string[]=[];
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
    // A fixed hierarchy cut follows camera scale. Selection, spare label space,
    // and fetched pages must never reveal an additional level at the same zoom.
    if(node.kind!=='cluster'||depth>=level)continue;
    const children=pages.get(node.id);
    if(!children){wanted.push(node.id);continue;}
    used.push(node.id);
    const next=children.filter(visible).sort(prioritize);
    if(frontier.length-1+next.length>cap)continue;
    expanded.push(node.id);
    frontier.splice(i,1,...next.map(node=>({node,depth:depth+1})));i--;
  }
  // A cluster bounds may intersect while its representative is outside. Keep
  // traversing its visible children; the renderer never changes source height.
  return {nodes:frontier.map(n=>n.node),wanted,used,cap,expanded};
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
