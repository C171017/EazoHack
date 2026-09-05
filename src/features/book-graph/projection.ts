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
// The default view looks into the positive XYZ octant bounded by the grids.
// Orthographic pan/zoom only change framing; these angles fix the viewing side.
export function confineCamera(camera:Pick<MapView,'yaw'|'pitch'>) {
  return {yaw:Math.max(-Math.PI/2,Math.min(0,camera.yaw)),pitch:Math.max(0,Math.min(Math.PI/2,camera.pitch))};
}
export function initialView(graphVersion: string): MapView {
  return {graphVersion,projection:'3d',axisConvention:'z-up-v1',...DEFAULT_CAMERA,x:0,y:0,zoom:1,selectedNodeId:null,readerAnchorId:null,sourceScope:'excerpt'};
}
export function orientation(projection: MapView['projection']) {
  return projection === 'xz' ? {yaw:0,pitch:0} : projection === 'xy' ? {yaw:0,pitch:Math.PI/2} : projection === 'yz' ? {yaw:-Math.PI/2,pitch:0} : DEFAULT_CAMERA;
}
// Orthographic Z-up camera: X is horizontal, Z/source is vertical, and
// Y/structure supplies depth. Semantic coordinates are never recalculated.
export function project(point: Point3, camera: Pick<MapView,'yaw'|'pitch'>) {
  const x = point.x*Math.cos(camera.yaw)+point.y*Math.sin(camera.yaw);
  const depth = -point.x*Math.sin(camera.yaw)+point.y*Math.cos(camera.yaw);
  return {x,y:-point.z*Math.cos(camera.pitch)+depth*Math.sin(camera.pitch),depth:point.z*Math.sin(camera.pitch)+depth*Math.cos(camera.pitch)};
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
    const preferredX = Math.max(8,Math.min(width-w-8,p.x+13));
    const preferredY = Math.max(12,Math.min(height-30,p.y-12));
    const columns = Math.max(1,Math.floor((width-16)/218));
    // Find the nearest free label slot anywhere in the scene. Only the labels
    // move; source-derived points and the graph's XYZ values remain untouched.
    const xs = [...new Set([preferredX,Math.max(8,Math.min(width-w-8,p.x-w-13)),...Array.from({length:columns},(_,i)=>8+i*218)])];
    const ys = [...new Set([preferredY,...Array.from({length:Math.max(1,Math.floor((height-24)/30))},(_,i)=>12+i*30)])];
    const slots=xs.flatMap(x=>ys.map(y=>({x,y,score:(x-preferredX)**2+(y-preferredY)**2}))).sort((a,b)=>a.score-b.score);
    const slot=slots.find(({x,y})=>!boxes.some(b=>x < b.x+b.width+4 && x+w+4 > b.x && y < b.y+b.height+4 && y+26+4 > b.y));
    const {x,y}=slot??{x:preferredX,y:preferredY};
    boxes.push({x,y,width:w,height:26});
    return {...p,labelX:x,labelY:y,width:w};
  });
}

// A wide capture radius encourages flat views; direction decides whether to snap.
// 48 degrees is a 60% increase over the original 30-degree threshold.
export const SNAP_ENTER = (48 * Math.PI) / 180;
export type SnapTarget = {projection:'xy'|'xz'|'yz';yaw:number;pitch:number;distance:number};
export function nearestProjection(camera:Pick<MapView,'yaw'|'pitch'>):SnapTarget {
  const pose=confineCamera(camera),quarter=Math.PI/2;
  const yaw=pose.yaw<-quarter/2?-quarter:0;
  const side:SnapTarget={projection:yaw===0?'xz':'yz',yaw,pitch:0,distance:Math.hypot(pose.yaw-yaw,pose.pitch)};
  const top:SnapTarget={projection:'xy',yaw,pitch:quarter,distance:quarter-pose.pitch};
  return side.distance<=top.distance?side:top;
}
export function orbitFrom(start:Pick<MapView,'yaw'|'pitch'>,dx:number,dy:number) {
  const pose=confineCamera(start);
  // Clamp each incremental input so a fence never accumulates an overshoot.
  return confineCamera({yaw:pose.yaw+dx*.006,pitch:pose.pitch+dy*.006});
}

function distanceToPlane(camera:Pick<MapView,'yaw'|'pitch'>,target:SnapTarget) {
  return target.projection==='xy'?Math.abs(camera.pitch-target.pitch):Math.hypot(camera.yaw-target.yaw,camera.pitch-target.pitch);
}
export function approachingProjection(from:Pick<MapView,'yaw'|'pitch'>,to:Pick<MapView,'yaw'|'pitch'>) {
  const target=nearestProjection(to);
  // Discrete arrow taps must accumulate when leaving a plane, rather than
  // snapping every step back to the place it started.
  return target.distance<=SNAP_ENTER&&target.distance<=distanceToPlane(from,target)+1e-8?target:null;
}
export function magneticPose(camera:Pick<MapView,'yaw'|'pitch'>,previous?:Pick<MapView,'yaw'|'pitch'>) {
  camera=confineCamera(camera);
  const target=nearestProjection(camera);
  if(previous&&target.distance>distanceToPlane(previous,target)+1e-8)return {yaw:camera.yaw,pitch:camera.pitch};
  const proximity=Math.max(0,1-target.distance/SNAP_ENTER);
  const pull=.55*proximity*proximity;
  // Do not steer yaw during a top-entry drag; align it in the release animation.
  return {yaw:target.projection==='xy'?camera.yaw:camera.yaw+(target.yaw-camera.yaw)*pull,pitch:camera.pitch+(target.pitch-camera.pitch)*pull};
}
type CameraPose=Pick<MapView,'yaw'|'pitch'>;
export type OrbitMotion={raw:CameraPose;display:CameraPose;previous:CameraPose;directionX:number;directionY:number};
export function beginOrbit(camera:CameraPose):OrbitMotion {
  const pose=confineCamera(camera);
  return {raw:pose,display:pose,previous:pose,directionX:0,directionY:0};
}
export function advanceOrbit(motion:OrbitMotion,dx:number,dy:number):OrbitMotion {
  const directionX=Math.sign(dx),directionY=Math.sign(dy);
  // On reversal, start at the displayed pose instead of jumping back across
  // the magnetic offset. Keep unmodified raw coordinates for continued input.
  const base={
    yaw:directionX&&motion.directionX&&directionX!==motion.directionX?motion.display.yaw:motion.raw.yaw,
    pitch:directionY&&motion.directionY&&directionY!==motion.directionY?motion.display.pitch:motion.raw.pitch,
  };
  const raw=orbitFrom(base,dx,dy);
  const previous=raw.yaw!==motion.raw.yaw||raw.pitch!==motion.raw.pitch?base:motion.previous;
  return {raw,previous,display:magneticPose(raw,previous),directionX:directionX||motion.directionX,directionY:directionY||motion.directionY};
}
export function springProgress(elapsedMs:number) {
  const t=Math.min(1,Math.max(0,elapsedMs/520));
  return t===1?1:1-(1+10*t)*Math.exp(-10*t);
}
