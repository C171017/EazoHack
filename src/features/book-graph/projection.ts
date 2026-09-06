import type { Graph, MapView } from '../../shared/schemas';
import { ZOOM_POLICY } from '../../shared/zoom-hierarchy';
export type Point3 = {x:number;y:number;z:number};
export const LEVELS = ['Detail / example','Claim','Concept','Argument','Core question'];
export const PROJECTIONS = [
  {id:'3d',label:'3D space',hint:'Orbit the shared space'},
  {id:'xy',label:'X × Y',hint:'Reasoning depth & generality'},
  {id:'xz',label:'X × Z',hint:'Reasoning through the source'},
  {id:'yz',label:'Y × Z',hint:'Generality through the source'},
] as const;
export const DEFAULT_CAMERA = {yaw:-0.58,pitch:0.36};
// The default view looks into the XY corner; source extends above and below it.
// Orthographic pan/zoom only change framing; these angles fix the viewing side.
export function confineCamera(camera:Pick<MapView,'yaw'|'pitch'>) {
  return {yaw:Math.max(-Math.PI/2,Math.min(0,camera.yaw)),pitch:Math.max(0,Math.min(Math.PI/2,camera.pitch))};
}
export function initialView(graphVersion: string): MapView {
  return {graphVersion,projection:'3d',axisConvention:'z-up-v1',...DEFAULT_CAMERA,x:0,y:0,zoom:ZOOM_POLICY.minZoom,selectedNodeId:null,readerAnchorId:null,sourceScope:'excerpt'};
}
export function orientation(projection: MapView['projection']) {
  return projection === 'xz' ? {yaw:0,pitch:0} : projection === 'xy' ? {yaw:0,pitch:Math.PI/2} : projection === 'yz' ? {yaw:-Math.PI/2,pitch:0} : DEFAULT_CAMERA;
}
// Orthographic Z-up camera: X is horizontal, Z/source is vertical, and
// Y/generality supplies depth. Semantic coordinates are never recalculated.
export function project(point: Point3, camera: Pick<MapView,'yaw'|'pitch'>) {
  const x = point.x*Math.cos(camera.yaw)+point.y*Math.sin(camera.yaw);
  const depth = -point.x*Math.sin(camera.yaw)+point.y*Math.cos(camera.yaw);
  return {x,y:-point.z*Math.cos(camera.pitch)+depth*Math.sin(camera.pitch),depth:point.z*Math.sin(camera.pitch)+depth*Math.cos(camera.pitch)};
}
export const SOURCE_Z_SPAN = 800;
// Earlier source sits above the fixed reading plane; later source below it.
export function sourceHeight(progress:number,readingProgress:number) {
  return (readingProgress-progress)*SOURCE_Z_SPAN;
}
export function sourceWorld(p:Point3,range:[number,number],readingProgress=.5):Point3 {
  const span=Math.max(Number.EPSILON,range[1]-range[0]);
  return {x:(p.x-.5)*500,y:(p.y/4-.5)*340,z:sourceHeight((p.z-range[0])/span,readingProgress)};
}
export function worldPoint(node: Graph['nodes'][number], range: [number,number],readingProgress=.5): Point3|null {
  const {x,y,z} = node.position;
  if(x === null || y === null || z === null) return null;
  return sourceWorld({x,y,z},range,readingProgress);
}
// Leader lines offset labels only; points always retain their semantic positions.
export type LabelObstacle={x:number;y:number;width:number;height:number};
export type MapOffset={x:number;y:number};
// Cluster badges are navigation handles. A bounded offset keeps tied groups
// clickable; callers draw the unchanged semantic anchor and its connector.
export function placeClusterHandles<T extends {id:string;x:number;y:number;radius:number;cluster:boolean}>(points:T[],width:number,height:number,obstacles:LabelObstacle[],previous:ReadonlyMap<string,MapOffset>=new Map()) {
  const occupied=points.filter(p=>!p.cluster).map(p=>({x:p.x,y:p.y,radius:p.radius}));
  const positions=new Map<string,{x:number;y:number}>();
  for(const p of [...points].filter(p=>p.cluster).sort((a,b)=>Number(previous.has(b.id))-Number(previous.has(a.id))||a.id.localeCompare(b.id))) {
    const radius=p.radius*1.1+5;
    const retained=previous.get(p.id);
    const candidates=[...(retained?[{x:p.x+retained.x,y:p.y+retained.y}]:[]),{x:p.x,y:p.y},...[32,48,64].flatMap(distance=>Array.from({length:12},(_,i)=>({x:p.x+distance*Math.cos(i*Math.PI/6),y:p.y+distance*Math.sin(i*Math.PI/6)})))];
    const position=candidates.find(q=>q.x>=radius&&q.y>=radius&&q.x<=width-radius&&q.y<=height-radius
      &&!occupied.some(o=>Math.hypot(q.x-o.x,q.y-o.y)<radius+o.radius)
      &&!obstacles.some(o=>q.x+radius>o.x&&q.x-radius<o.x+o.width&&q.y+radius>o.y&&q.y-radius<o.y+o.height))??p;
    occupied.push({...position,radius});positions.set(p.id,position);
  }
  return points.map(p=>({...p,anchorX:p.x,anchorY:p.y,...positions.get(p.id)}));
}
export function placeLabels<T extends {id:string;x:number;y:number;label:string;radius?:number}>(points:T[],width:number,height:number,obstacles:LabelObstacle[]=[],markers:{x:number;y:number;radius?:number}[]=points,previous:ReadonlyMap<string,MapOffset>=new Map()) {
  const boxes:LabelObstacle[]=[...obstacles,...markers.map(p=>({x:p.x-(p.radius??18)-5,y:p.y-(p.radius??18)-5,width:((p.radius??18)+5)*2,height:((p.radius??18)+5)*2}))];
  const placed=new Map<string,T&{labelX:number;labelY:number;width:number}>();
  const pending:T[]=[];
  // Reserve room for the 13px map labels, their halo, and horizontal padding.
  const labelWidth=(p:T)=>Math.min(Math.max(40,width-16),242,Math.max(100,Math.min(p.label.length,31)*7.2+18));
  const free=(x:number,y:number,w:number,gap:number)=>x>=8&&y>=12&&x+w<=width-8&&y+26<=height-4
    &&!boxes.some(b=>x<b.x+b.width+gap&&x+w+gap>b.x&&y<b.y+b.height+gap&&y+26+gap>b.y);
  const reserve=(p:T,x:number,y:number,w:number)=>{
    boxes.push({x,y,width:w,height:26});placed.set(p.id,{...p,labelX:x,labelY:y,width:w});
  };
  // Reserve valid old offsets first, so an entering node cannot steal a
  // neighbour's label slot. Smaller retention clearance adds hysteresis.
  for(const p of points) {
    const offset=previous.get(p.id),w=labelWidth(p);
    if(offset&&free(p.x+offset.x,p.y+offset.y,w,2))reserve(p,p.x+offset.x,p.y+offset.y,w);
    else pending.push(p);
  }
  for(const p of pending) {
    const w=labelWidth(p),clearance=(p.radius??18)*1.1+14;
    // All slots follow the node, not a screen-aligned grid. Search all sides
    // locally before considering longer leaders; use the pane's spare space.
    const slots=[0,32,64,96,128,160].flatMap(extra=>{
      const d=clearance+extra;
      return [
        {x:p.x+d,y:p.y-13},{x:p.x-w-d,y:p.y-13},
        {x:p.x-w/2,y:p.y-26-d},{x:p.x-w/2,y:p.y+d},
        {x:p.x+d,y:p.y-26-d},{x:p.x-w-d,y:p.y-26-d},
        {x:p.x+d,y:p.y+d},{x:p.x-w-d,y:p.y+d},
      ].map(slot=>({...slot,score:extra*10+Math.hypot(slot.x+w/2-width/2,slot.y+13-height/2)*.02}));
    }).sort((a,b)=>a.score-b.score);
    const slot=slots.find(({x,y})=>free(x,y,w,8));
    // No unsafe fallback: the marker and its accessible name stay available.
    if(slot)reserve(p,slot.x,slot.y,w);
  }
  return points.flatMap(p=>{const label=placed.get(p.id);return label?[label]:[];});
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
