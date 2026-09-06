import type { MapView } from '../../shared/schemas';
import type { MapEntry } from '../../shared/zoom-hierarchy';
import { project, sourceWorld, type Point3 } from './projection';

import { GRID_PAN_BOUNDS } from './grid-bounds';

export type Size = {width:number;height:number};
export function baseScale(size:Size) { return Math.max(.08,Math.min((size.width-180)/660,(size.height-100)/500)); }

// Framing is independent of semantic zoom and is saved with the camera. Its
// world-space centre stays fixed while orbiting or advancing the source plane.
export function screenWorld(p:Point3,view:MapView,size:Size) {
  const c=view.framing?.center??{x:0,y:0,z:0};
  const q=project({x:p.x-c.x,y:p.y-c.y,z:p.z-c.z},view);
  const scale=baseScale(size)*(view.framing?.scale??1)*view.zoom;
  return {x:size.width/2+q.x*scale+view.x,y:size.height/2+q.y*scale+view.y};
}

export function mapObstacles(view:MapView,size:Size,keyHeight=58) {
  const origin=screenWorld({x:-250,y:-170,z:0},view,size);
  return [{x:0,y:0,width:size.width,height:keyHeight},{x:0,y:size.height-40,width:size.width,height:40},
    ...(view.pitch<Math.PI/2-.12?[{x:origin.x-28,y:origin.y-46,width:56,height:92}]:[]),
    ...(view.selectedNodeId?[{x:16,y:size.height-302,width:size.width-32,height:250}]:[])];
}

export function fitEntries(entries:MapEntry[],view:MapView,size:Size,progress:number,bottomReserve=0):MapView {
  const points=entries.flatMap(n=>n.position?[sourceWorld(n.position,[0,1],progress)]:[]);
  if(!points.length)return {...view,x:0,y:0};
  // Keep the source-scroll origin reachable in projections that show Z.
  if(view.pitch<Math.PI/2-.12)points.push({x:-250,y:-170,z:0});
  const projected=points.map(p=>project(p,view));
  const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const {yaw,pitch}=view;
  const center={x:cx*Math.cos(yaw)-cy*Math.sin(yaw)*Math.sin(pitch),y:cx*Math.sin(yaw)+cy*Math.cos(yaw)*Math.sin(pitch),z:-cy*Math.cos(pitch)};
  const inspector=(view.selectedNodeId?260:0)+bottomReserve;
  const pixels=Math.min(Math.max(80,size.width-260)/Math.max(120,Math.max(...xs)-Math.min(...xs)),Math.max(80,size.height-180-inspector)/Math.max(120,Math.max(...ys)-Math.min(...ys)));
  const scale=Math.max(.05,Math.min(20,pixels/baseScale(size)/view.zoom));
  return {...view,x:0,y:-inspector/2,framing:{center,scale}};
}

// Apply the same screen-space limits to gestures, restored views and resizing.
export function confinePan(view:MapView,size:Size):MapView {
  if(size.width<=0||size.height<=0)return view;
  const {min,max}=GRID_PAN_BOUNDS;
  const unpanned={...view,x:0,y:0};
  const corners=[min.x,max.x].flatMap(x=>[min.y,max.y].flatMap(y=>[min.z,max.z].map(z=>screenWorld({x,y,z},unpanned,size))));
  const limit=(offset:number,values:number[],length:number)=>{
    const start=Math.min(...values),end=Math.max(...values);
    const margin=Math.min(48,length*.08);
    // Preserve a small centred travel range while the grid fits onscreen, then
    // expand it continuously. Switching clamp formulas at length - 2*margin
    // abruptly collapsed that range and made a tiny zoom jump by 48 pixels.
    const center=(length-start-end)/2;
    const travel=margin+Math.max(0,(end-start-length)/2);
    return Math.max(center-travel,Math.min(center+travel,offset));
  };
  const x=limit(view.x,corners.map(p=>p.x),size.width),y=limit(view.y,corners.map(p=>p.y),size.height);
  return x===view.x&&y===view.y?view:{...view,x,y};
}
