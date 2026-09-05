'use client';
import { useState } from 'react';
import { useMapRequest } from './map-data';
export function UnplacedNotes({version,count,onLocate}:{version:string;count:number;onLocate:(id:string)=>void}) {
  const [open,setOpen]=useState(false),[offset,setOffset]=useState(0);
  const result=useMapRequest<{total:number;notes:{id:string;label:string;sourceLabel:string}[]}>(version,open?{kind:'unplaced',offset:String(offset)}:null);
  return <details className="map-unplaced" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Unplaced notes · {count}</summary>
    <p>These notes have an uncertain coordinate. Their original passages remain available.</p>
    {result.error?<p role="alert">{result.error} <button onClick={result.retry}>Retry</button></p>:result.loading?<p role="status">Loading notes…</p>:<ul>{result.data?.notes.map(n=><li key={n.id}><button onClick={()=>onLocate(n.id)}>{n.label} ↗</button><small>{n.sourceLabel}</small></li>)}</ul>}
    <div>{offset>0&&<button onClick={()=>setOffset(n=>Math.max(0,n-20))}>Previous</button>}{offset+20<(result.data?.total??count)&&<button onClick={()=>setOffset(n=>n+20)}>Next</button>}</div>
  </details>;
}
