import { AXIS_LABELS, LEGACY_AXIS_LABELS, type BookAxisVersion } from '../../shared/book-axes';
import { memo, useId } from 'react';
import { sourceHeight, type Point3 } from './projection';

import { ORIGIN, GRID_EXTENT, GRID_BACK_EXTENT } from './grid-bounds';
export { ORIGIN } from './grid-bounds';
// Spatial reference spacing is independent of the semantic rating precision.
const SPACING = 50;
const EXTENT = GRID_EXTENT;
const BACK_EXTENT = GRID_BACK_EXTENT;
const AXES = ['x','y','z'] as const;
const PLANES = [['x','y'],['x','z'],['y','z']] as const;
const COLORS = ['#D87970','#729AD5','#F2EEE5'];
const LABEL_DISTANCE = [530,365,430];
const OFFSETS = Array.from({length:(EXTENT+BACK_EXTENT)/SPACING-1},(_,i)=>-BACK_EXTENT+(i+1)*SPACING).filter(n=>n!==0);
const VERTICAL_OFFSETS = Array.from({length:39},(_,i)=>(i-19)*SPACING).filter(n=>n!==0);
// A smooth finite envelope: fully transparent at the geometry's endpoints.
function fade(distance:number) {
  const t=Math.max(0,Math.min(1,distance<0?-distance/BACK_EXTENT:(distance-300)/(EXTENT-300)));
  return 1-t*t*(3-2*t);
}
function point(axis:keyof Point3,distance:number,other?:keyof Point3,offset=0):Point3 {
  return {...ORIGIN,[axis]:ORIGIN[axis]+distance,...(other?{[other]:ORIGIN[other]+offset}:{})};
}

type Point2={x:number;y:number};
// Each grid plane is an affine projection of immutable world geometry. Pan and
// zoom update these matrices, not thousands of gradient stops and endpoints.
export function gridPlaneTransform(origin:Point2,u:Point2,v:Point2) {
  return `matrix(${u.x} ${u.y} ${v.x} ${v.y} ${origin.x} ${origin.y})`;
}
function GridLine({name,x1,y1,x2,y2,vertical,color,opacity=1}:{name:string;x1:number;y1:number;x2:number;y2:number;vertical:boolean;color:string;opacity?:number}) {
  const id=useId(),gradient=`${id}-${name}`;
  return <g><defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
    {Array.from({length:21},(_,i)=><stop key={i} offset={`${i*5}%`} stopColor={color} stopOpacity={fade(vertical?Math.abs(-EXTENT+i*EXTENT/10):-BACK_EXTENT+i*(EXTENT+BACK_EXTENT)/20)}/>)}
  </linearGradient></defs><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#${gradient})`} opacity={opacity}/></g>;
}
const PlaneLines=memo(function PlaneLines({u,v}:{u:keyof Point3;v:keyof Point3}) {
  return <>
    {(v==='z'?VERTICAL_OFFSETS:OFFSETS).map(offset=><GridLine key={`u-${offset}`} name={`u-${offset}`} x1={u==='z'?-EXTENT:-BACK_EXTENT} y1={offset} x2={EXTENT} y2={offset} vertical={u==='z'} color="#9299A3" opacity={.24*fade(v==='z'?Math.abs(offset):offset)}/>)}
    {(u==='z'?VERTICAL_OFFSETS:OFFSETS).map(offset=><GridLine key={`v-${offset}`} name={`v-${offset}`} x1={offset} y1={v==='z'?-EXTENT:-BACK_EXTENT} x2={offset} y2={EXTENT} vertical={v==='z'} color="#9299A3" opacity={.24*fade(u==='z'?Math.abs(offset):offset)}/>)}
  </>;
});
const AxisLine=memo(function AxisLine({axis,color}:{axis:keyof Point3;color:string}) {
  return <GridLine name={axis} x1={axis==='z'?-EXTENT:-BACK_EXTENT} y1={0} x2={EXTENT} y2={0} vertical={axis==='z'} color={color} opacity={.66}/>;
});

export function MapGrid({screen,axisVersion,readingProgress=.5}:{size?:{width:number;height:number};projection?:string;axisVersion?:BookAxisVersion;readingProgress?:number;screen:(point:Point3)=>Point2}) {
  const modern=!!axisVersion;
  const origin=screen(ORIGIN);
  const directions=AXES.map(axis=>{const p=screen(point(axis,1));return {x:p.x-origin.x,y:p.y-origin.y};});
  const scaleSquared=directions.reduce((sum,d)=>sum+d.x*d.x+d.y*d.y,0)/2;
  return <g className="map-grid" aria-hidden="true" pointerEvents="none">
    {PLANES.map(([u,v])=>{
      const a=directions[AXES.indexOf(u)],b=directions[AXES.indexOf(v)];
      const facing=Math.min(1,Math.abs(a.x*b.y-a.y*b.x)/scaleSquared*4);
      return <g key={`${u}${v}`} transform={gridPlaneTransform(origin,a,b)} opacity={facing} visibility={facing<.001?'hidden':undefined}>
        <PlaneLines u={u} v={v}/>
      </g>;
    })}
    {AXES.map((axis,i)=>{
      const d=directions[i];
      return <g key={axis} transform={gridPlaneTransform(origin,d,{x:-d.y,y:d.x})} visibility={Math.hypot(d.x,d.y)<.00001?'hidden':undefined}>
        <AxisLine axis={axis} color={COLORS[i]}/>
      </g>;
    })}
    {AXES.map((axis,i)=>{
      const d=directions[i];if(Math.hypot(d.x,d.y)<.01)return null;
      const p=screen(point(axis,LABEL_DISTANCE[i]));
      return <text key={axis} x={p.x+8} y={p.y-8} fill={COLORS[i]} className="map-axis-title">{axis==='z'?'Z · Earlier in the book ↑':(modern?AXIS_LABELS:LEGACY_AXIS_LABELS)[i]}</text>;
    })}
    {Math.hypot(directions[2].x,directions[2].y)>.01&&Array.from({length:11},(_,i)=>{
      const p=screen({...ORIGIN,z:sourceHeight(i/10,readingProgress)});
      return <g key={`source-${i}`} className="map-axis-ticks"><line x1={p.x-4} x2={p.x+4} y1={p.y} y2={p.y} stroke={COLORS[2]}/><text x={p.x-9} y={p.y+3} textAnchor="end">{i*10}%</text></g>;
    })}
    <circle data-reading-origin cx={origin.x} cy={origin.y} r="3" fill={COLORS[2]}/>

  </g>;
}
