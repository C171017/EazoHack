import { AXIS_LABELS, LEGACY_AXIS_LABELS } from '../../shared/book-axes';
import { useId } from 'react';
import type { Point3 } from './projection';

const ORIGIN: Point3 = {x:-250,y:-170,z:-200};
const SPACING = 50;
const EXTENT = 1000;
const BACK_EXTENT = 150;
const AXES = ['x','y','z'] as const;
const PLANES = [['x','y'],['x','z'],['y','z']] as const;
const COLORS = ['#caaf7c','#84b7ad','#a398cb'];
const LABEL_DISTANCE = [530,365,430];
const OFFSETS = Array.from({length:(EXTENT+BACK_EXTENT)/SPACING-1},(_,i)=>-BACK_EXTENT+(i+1)*SPACING).filter(n=>n!==0);
// A smooth finite envelope: fully transparent at the geometry's endpoints.
function fade(distance:number) {
  const t=Math.max(0,Math.min(1,distance<0?-distance/BACK_EXTENT:(distance-300)/(EXTENT-300)));
  return 1-t*t*(3-2*t);
}
function point(axis:keyof Point3,distance:number,other?:keyof Point3,offset=0):Point3 {
  return {...ORIGIN,[axis]:ORIGIN[axis]+distance,...(other?{[other]:ORIGIN[other]+offset}:{})};
}

export function MapGrid({screen,modern=false}:{modern?:boolean;screen:(point:Point3)=>{x:number;y:number}}) {
  const id=useId();
  const origin=screen(ORIGIN);
  const directions=AXES.map(axis=>{const p=screen(point(axis,1));return {x:p.x-origin.x,y:p.y-origin.y};});
  const scaleSquared=directions.reduce((sum,d)=>sum+d.x*d.x+d.y*d.y,0)/2;
  const lines: {key:string;a:Point3;b:Point3;color:string;opacity:number}[]=[];
  for(const [u,v] of PLANES) {
    const a=directions[AXES.indexOf(u)],b=directions[AXES.indexOf(v)];
    // Fade edge-on planes to avoid stacks of coincident lines in flat views.
    const facing=Math.min(1,Math.abs(a.x*b.y-a.y*b.x)/scaleSquared*4);
    if(facing<.001)continue;
    for(const [axis,other] of [[u,v],[v,u]] as const)for(const offset of OFFSETS) {
      lines.push({key:`${u}${v}-${axis}-${offset}`,a:point(axis,-BACK_EXTENT,other,offset),b:point(axis,EXTENT,other,offset),color:'#8da999',opacity:.24*fade(offset)*facing});
    }
  }
  AXES.forEach((axis,i)=>lines.push({key:axis,a:point(axis,-BACK_EXTENT),b:point(axis,EXTENT),color:COLORS[i],opacity:.66}));
  return <g className="map-grid" aria-hidden="true" pointerEvents="none">
    {lines.map(line=>{
      const a=screen(line.a),b=screen(line.b),gradient=`${id}-${line.key}`;
      if(Math.hypot(a.x-b.x,a.y-b.y)<.01)return null;
      return <g key={line.key}>
        <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
          {Array.from({length:21},(_,i)=><stop key={i} offset={`${i*5}%`} stopColor={line.color} stopOpacity={fade(-BACK_EXTENT+i*(EXTENT+BACK_EXTENT)/20)}/>) }
        </linearGradient></defs>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`url(#${gradient})`} opacity={line.opacity}/>
      </g>;
    })}
    {AXES.map((axis,i)=>{
      const d=directions[i];if(Math.hypot(d.x,d.y)<.01)return null;
      const p=screen(point(axis,LABEL_DISTANCE[i]));
      return <text key={axis} x={p.x+8} y={p.y-8} fill={COLORS[i]} className="map-axis-title">{(modern?AXIS_LABELS:LEGACY_AXIS_LABELS)[i]}</text>;
    })}
  </g>;
}
