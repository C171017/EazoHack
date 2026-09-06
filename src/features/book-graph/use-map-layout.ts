'use client';
import { useEffect, useState } from 'react';
import { placeClusterHandles, placeLabels, type LabelObstacle, type MapOffset } from './projection';

export type LayoutPoint={id:string;x:number;y:number;radius:number;cluster:boolean;label:string;exiting:boolean};
export type MapLayout={key:string;signature:string;handles:Map<string,MapOffset>;labels:Map<string,MapOffset&{width:number}>};
const emptyLayout=():MapLayout=>({key:'',signature:'',handles:new Map(),labels:new Map()});
export const MAP_LAYOUT_SETTLE_MS=160;

export function solveMapLayout(points:LayoutPoint[],width:number,height:number,obstacles:LabelObstacle[],labelCap:number,selected:string|null,previous:MapLayout=emptyLayout()) {
  const handles=placeClusterHandles(points,width,height,obstacles,previous.handles);
  const labelPoints=handles.filter(p=>!p.exiting&&p.x>=0&&p.y>=0&&p.x<=width&&p.y<=height)
    .sort((a,b)=>Number(b.id===selected)-Number(a.id===selected)
      ||Number(previous.labels.has(b.id))-Number(previous.labels.has(a.id))
      ||Number(b.cluster)-Number(a.cluster)||a.id.localeCompare(b.id)).slice(0,labelCap);
  const labels=placeLabels(labelPoints,width,height,obstacles,handles.map(p=>({...p,radius:p.radius*1.1})),previous.labels);
  return {
    handles:new Map(handles.map(p=>[p.id,{x:p.x-p.anchorX,y:p.y-p.anchorY}])),
    labels:new Map(labels.map(p=>[p.id,{x:p.labelX-p.x,y:p.labelY-p.y,width:p.width}])),
  };
}

// Project every camera frame, but solve collisions only once motion settles.
// Offsets belong to nodes: pan/zoom never animate text independently of them.
export function useMapLayout<T extends LayoutPoint>(points:T[],width:number,height:number,obstacles:LabelObstacle[],labelCap:number,selected:string|null,key:string) {
  const [layout,setLayout]=useState<MapLayout>(emptyLayout);
  const signature=JSON.stringify([key,width,height,obstacles,labelCap,selected,points.map(p=>[p.id,p.x,p.y,p.radius,p.cluster,p.label,p.exiting])]);
  useEffect(()=>{
    if(layout.signature===signature)return;
    const timer=setTimeout(()=>setLayout({key,signature,...solveMapLayout(points,width,height,obstacles,labelCap,selected,layout.key===key?layout:undefined)}),MAP_LAYOUT_SETTLE_MS);
    return()=>clearTimeout(timer);
  },[signature,key,points,width,height,obstacles,labelCap,selected,layout]);
  const positioned=points.map(p=>{
    const offset=layout.key===key?layout.handles.get(p.id):undefined;
    return {...p,anchorX:p.x,anchorY:p.y,x:p.x+(offset?.x??0),y:p.y+(offset?.y??0)};
  });
  const labels=new Map(positioned.flatMap(p=>{
    const offset=layout.key===key?layout.labels.get(p.id):undefined;
    return offset&&!p.exiting?[[p.id,{labelX:p.x+offset.x,labelY:p.y+offset.y,width:offset.width}] as const]:[];
  }));
  return {points:positioned,labels};
}
