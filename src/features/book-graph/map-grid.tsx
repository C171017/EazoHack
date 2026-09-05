import { AXIS_LABELS, LEGACY_AXIS_LABELS, BOOK_AXIS_VERSION, axisMaximum, type BookAxisVersion } from '../../shared/book-axes';
import { useId } from 'react';
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

export function MapGrid({screen,axisVersion,readingProgress=.5,size,projection}:{size?:{width:number;height:number};projection?:string;axisVersion?:BookAxisVersion;readingProgress?:number;screen:(point:Point3)=>{x:number;y:number}}) {
  const id=useId();
  const modern=!!axisVersion;
  const tickIntervals=axisVersion===BOOK_AXIS_VERSION?5:8;
  const origin=screen(ORIGIN);
  const directions=AXES.map(axis=>{const p=screen(point(axis,1));return {x:p.x-origin.x,y:p.y-origin.y};});
  const scaleSquared=directions.reduce((sum,d)=>sum+d.x*d.x+d.y*d.y,0)/2;
  const lines: {key:string;a:Point3;b:Point3;color:string;opacity:number;vertical?:boolean}[]=[];
  for(const [u,v] of PLANES) {
    const a=directions[AXES.indexOf(u)],b=directions[AXES.indexOf(v)];
    // Fade edge-on planes to avoid stacks of coincident lines in flat views.
    const facing=Math.min(1,Math.abs(a.x*b.y-a.y*b.x)/scaleSquared*4);
    if(facing<.001)continue;
    for(const [axis,other] of [[u,v],[v,u]] as const)for(const offset of other==='z'?VERTICAL_OFFSETS:OFFSETS) {
      lines.push({key:`${u}${v}-${axis}-${offset}`,a:point(axis,axis==='z'?-EXTENT:-BACK_EXTENT,other,offset),b:point(axis,EXTENT,other,offset),color:'#9299A3',opacity:.24*fade(other==='z'?Math.abs(offset):offset)*facing,vertical:axis==='z'});
    }
  }
  AXES.forEach((axis,i)=>lines.push({key:axis,a:point(axis,axis==='z'?-EXTENT:-BACK_EXTENT),b:point(axis,EXTENT),color:COLORS[i],opacity:.66,vertical:axis==='z'}));
  return <g className="map-grid" aria-hidden="true" pointerEvents="none">
    {lines.map(line=>{
      const a=screen(line.a),b=screen(line.b),gradient=`${id}-${line.key}`;
      if(Math.hypot(a.x-b.x,a.y-b.y)<.01)return null;
      return <g key={line.key}>
        <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
          {Array.from({length:21},(_,i)=><stop key={i} offset={`${i*5}%`} stopColor={line.color} stopOpacity={fade(line.vertical?Math.abs(-EXTENT+i*EXTENT/10):-BACK_EXTENT+i*(EXTENT+BACK_EXTENT)/20)}/>) }
        </linearGradient></defs>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`url(#${gradient})`} opacity={line.opacity}/>
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
    {modern&&projection==='xy'&&size&&<g className="map-axis-ticks">
      {Array.from({length:tickIntervals+1},(_,i)=>{
        const x=screen({x:-250+i*500/tickIntervals,y:-170,z:0}).x,y=screen({x:-250,y:-170+i*340/tickIntervals,z:0}).y;
        return <g key={`rating-${i}`}>
          {x>40&&x<size.width-40&&<text x={x} y={size.height-16} textAnchor="middle">X {Number((i*axisMaximum(axisVersion)/tickIntervals).toFixed(1))}</text>}
          {y>64&&y<size.height-40&&<text x={12} y={y+3}>Y {Number((i*axisMaximum(axisVersion)/tickIntervals).toFixed(1))}</text>}
        </g>;
      })}
    </g>}
  </g>;
}
