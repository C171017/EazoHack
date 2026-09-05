import type { Graph, MapView } from '../../shared/schemas';
export type Point3 = {x:number;y:number;z:number};
export const LEVELS = ['Detail / example','Claim','Concept','Argument','Core question'];
export const PROJECTIONS = [
  {id:'3d',label:'3D space',hint:'Orbit the shared space'},
  {id:'xy',label:'X × Y',hint:'Themes & structure'},
  {id:'xz',label:'X × Z',hint:'Theme development'},
  {id:'yz',label:'Y × Z',hint:'Structure development'},
] as const;
export const DEFAULT_CAMERA = {yaw:-0.58,pitch:0.36};
export function initialView(graphVersion: string): MapView {
  return {graphVersion,projection:'3d',...DEFAULT_CAMERA,x:0,y:0,zoom:1,selectedNodeId:null,readerAnchorId:null,sourceScope:'excerpt'};
}
export function orientation(projection: MapView['projection']) {
  return projection === 'xy' ? {yaw:0,pitch:0} : projection === 'xz' ? {yaw:0,pitch:-Math.PI/2} : projection === 'yz' ? {yaw:Math.PI/2,pitch:0} : DEFAULT_CAMERA;
}
// Orthographic camera: rotate one world, never recalculate semantic coordinates.
export function project(point: Point3, camera: Pick<MapView,'yaw'|'pitch'>) {
  const x = point.x*Math.cos(camera.yaw)+point.z*Math.sin(camera.yaw);
  const depth = -point.x*Math.sin(camera.yaw)+point.z*Math.cos(camera.yaw);
  return {x,y:-point.y*Math.cos(camera.pitch)+depth*Math.sin(camera.pitch),depth:point.y*Math.sin(camera.pitch)+depth*Math.cos(camera.pitch)};
}
export function worldPoint(node: Graph['nodes'][number], range: [number,number]): Point3|null {
  const {x,y,z} = node.position;
  if(x === null || y === null || z === null) return null;
  return {x:(x-.5)*500,y:(y/4-.5)*340,z:((z-range[0])/(range[1]-range[0])-.5)*400};
}
// Leader lines offset labels only; points always retain their semantic positions.
export function placeLabels<T extends {id:string;x:number;y:number;label:string}>(points: T[], width:number,height:number) {
  const boxes: {x:number;y:number;width:number;height:number}[] = [];
  return points.map(p => {
    const w = Math.min(210,Math.max(100,p.label.length*6.1+18));
    const x = Math.max(8,Math.min(width-w-8,p.x+13));
    let y = Math.max(12,Math.min(height-30,p.y-12));
    for(let i=0;i<40;i++) {
      if(!boxes.some(b=>x < b.x+b.width+4 && x+w+4 > b.x && y < b.y+b.height+4 && y+26+4 > b.y)) break;
      y += 30;
      if(y>height-30) y=12;
    }
    boxes.push({x,y,width:w,height:26});
    return {...p,labelX:x,labelY:y,width:w};
  });
}

// Separate capture and release radii prevent jitter when leaving a magnetic plane.
export const SNAP_ENTER = Math.PI / 18; // 10 degrees
export const SNAP_EXIT = Math.PI / 12; // 15 degrees
export type SnapTarget = {projection:'xy'|'xz'|'yz';yaw:number;pitch:number;distance:number};
export function nearestProjection(camera:Pick<MapView,'yaw'|'pitch'>):SnapTarget {
  const quarter=Math.PI/2;
  const yaw=Math.round(camera.yaw/quarter)*quarter;
  const side:SnapTarget={projection:Math.abs(Math.round(yaw/quarter)%2)===0?'xy':'yz',yaw,pitch:0,distance:Math.hypot(camera.yaw-yaw,camera.pitch)};
  const poleYaw=Math.round(camera.yaw/Math.PI)*Math.PI;
  const pitch=camera.pitch<0?-quarter:quarter;
  const top:SnapTarget={projection:'xz',yaw:poleYaw,pitch,distance:Math.hypot(camera.yaw-poleYaw,camera.pitch-pitch)};
  return side.distance<=top.distance?side:top;
}
export function orbitFrom(start:Pick<MapView,'yaw'|'pitch'>,dx:number,dy:number) {
  const requested=start.pitch+dy*.006;
  // Either drag direction can pull away from a top/bottom projection.
  const wrapped=((requested+Math.PI/2)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  const pitch=wrapped<=Math.PI?wrapped-Math.PI/2:3*Math.PI/2-wrapped;
  return {yaw:start.yaw+dx*.006,pitch};
}
export function magneticPose(camera:Pick<MapView,'yaw'|'pitch'>) {
  const target=nearestProjection(camera);
  const proximity=Math.max(0,1-target.distance/SNAP_ENTER);
  const pull=.55*proximity*proximity;
  return {yaw:camera.yaw+(target.yaw-camera.yaw)*pull,pitch:camera.pitch+(target.pitch-camera.pitch)*pull};
}
export function springProgress(elapsedMs:number) {
  const t=Math.min(1,Math.max(0,elapsedMs/520));
  return t===1?1:1-(1+10*t)*Math.exp(-10*t);
}
