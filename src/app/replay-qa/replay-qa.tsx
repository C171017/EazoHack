'use client';
import { useMemo, useState } from 'react';
import type { MapView } from '@/shared/schemas';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { BookMap } from '@/features/book-graph/book-map';
import type { HeatLeaf, HeatPoint } from '@/features/book-graph/heat-placement';
import type { ReadingFootprint } from '@/features/book-graph/reading-heat';
export function ReplayQA({graph,leaves}:{graph:MapBootstrap;leaves:HeatLeaf[]}) {
  const [view,setView]=useState<MapView|null>(null),[mode,setMode]=useState('multiple'),[writes,setWrites]=useState(0);
  const points=useMemo(()=>leaves.flatMap((leaf,i)=>{
    if(!leaf.position)return [];
    const events:ReadingFootprint[]=(mode==='empty'?[]:mode==='single'?[0]:[0,3,1,2,3,3,0,4,1,3,3,3,3,3,3,3,3,3]).flatMap((n,j)=>n===i?[{id:`qa-${j}`,createdAt:new Date(Date.UTC(2026,8,j+1,10)).toISOString(),kind:'explanation',bookId:graph.bookId,anchors:[],artifacts:[]}]:[]);
    return events.length?[{leaf:{...leaf,position:leaf.position},events,counts:{explanation:events.length,diagram:0,interactive:0,illustration:0},nearest:0} satisfies HeatPoint]:[];
  }),[mode,leaves,graph.bookId]);
  return <div style={{height:'100vh',background:'#121519'}}><div style={{position:'absolute',right:16,top:16,zIndex:20,color:'white',display:'flex',gap:16}}>
    {['empty','single','multiple'].map(m=><button key={m} onClick={()=>setMode(m)}>{m}</button>)}
    <output data-camera-writes={writes}>Camera writes: {writes}</output></div>
    <BookMap graph={graph} heat={{points,loading:false,error:null,excluded:0,unmapped:0,retry:()=>{}}} view={view} onViewChange={v=>{setView(v);setWrites(n=>n+1);}} readingProgress={.4} onSource={()=>{}} onScrollSource={()=>{}}/>
  </div>;
}
