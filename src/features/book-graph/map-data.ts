'use client';
import { useEffect, useMemo, useState } from 'react';
import { MapEntrySchema, type MapEntry } from '../../shared/zoom-hierarchy';
import { PageCache } from './semantic-window';
export function mapUrl(version:string,params:Record<string,string|string[]>) {
  const query=new URLSearchParams({version});for(const [key,value] of Object.entries(params))for(const item of Array.isArray(value)?value:[value])query.append(key,item);
  return `/api/book-map?${query}`;
}
export async function readMap<T>(version:string,params:Record<string,string|string[]>,signal?:AbortSignal):Promise<T> {
  const response=await fetch(mapUrl(version,params),{signal});const body=await response.json();
  if(!response.ok)throw new Error(body.error??'Could not load map data');
  if(body.version!==version)throw new Error('Map version changed. Reload to continue.');
  return body as T;
}
export function useMapRequest<T>(version:string,params:Record<string,string|string[]>|null,delay=80) {
  const key=params?JSON.stringify(params):'', [attempt,retry]=useState(0);
  const [state,setState]=useState<{key:string;data?:T;error?:string}>({key:''});
  useEffect(()=>{
    if(!key)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      readMap<T>(version,JSON.parse(key),controller.signal).then(data=>{if(!controller.signal.aborted)setState({key,data});}).catch(error=>{if(!controller.signal.aborted)setState({key,error:error.message});});
    },delay);
    return()=>{clearTimeout(timer);controller.abort();};
  },[version,key,delay,attempt]);
  return {data:state.key===key?state.data:undefined,error:state.key===key?state.error:undefined,loading:!!key&&(state.key!==key||!state.data&&!state.error),retry:()=>{setState({key:''});retry(n=>n+1);}};
}
export function useMapPages<T extends {wanted:string[];used:string[]}>(version:string,select:(pages:ReadonlyMap<string,MapEntry[]>)=>T) {
  const [cache]=useState(()=>new PageCache());
  const [pages,setPages]=useState<ReadonlyMap<string,MapEntry[]>>(()=>new Map());
  const [error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const windowed=select(pages);
  const key=JSON.stringify(windowed.wanted.slice(0,12)),protectedKey=JSON.stringify(windowed.used);
  useEffect(()=>{
    const ids=JSON.parse(key) as string[];if(!ids.length)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      readMap<{pages:Record<string,MapEntry[]>}>(version,{kind:'children',id:ids},controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        const protectedIds=new Set<string>([...JSON.parse(protectedKey),...ids]);
        cache.touch([...protectedIds]);
        for(const id of ids){const nodes=MapEntrySchema.array().parse(result.pages[id]);if(nodes.some(n=>n.parentId!==id))throw new Error('Invalid subtree');cache.put(id,nodes,protectedIds);}
        setPages(new Map(cache.pages));setError(null);
      }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    },80);
    return()=>{clearTimeout(timer);controller.abort();};
  },[version,key,protectedKey,cache,attempt]);
  const install=useMemo(()=>(incoming:Record<string,MapEntry[]>)=>{
    const ids=new Set(Object.keys(incoming));
    for(const [id,nodes] of Object.entries(incoming))cache.put(id,MapEntrySchema.array().parse(nodes),ids);
    setPages(new Map(cache.pages));
  },[cache]);
  return {pages,windowed,error,install,retry:()=>{setError(null);setAttempt(n=>n+1);}};
}
