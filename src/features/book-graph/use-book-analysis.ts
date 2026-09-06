'use client';
import { useEffect, useState } from 'react';
import type { BookPreview } from '../reader/book-preview';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
type AnalysisState = { status: 'starting' | 'running' | 'ready' | 'failed' | 'idle' | 'unavailable'; stage: string; error?: string; key?: string; graph?: MapBootstrap; updatedAt?: number };
export function useBookAnalysis(bookId: string, preview: BookPreview, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AnalysisState>({status:'starting',stage:'Starting book map analysis'});
  useEffect(() => {
    if (!enabled) return;
    let active=true, timer:ReturnType<typeof setTimeout> | undefined;
    const controller=new AbortController();
    const storageKey=`eazo-map-job:${bookId}:${preview.extractionVersion}`;
    async function request(url:string, body?:object) {
      const response=await fetch(url,{signal:controller.signal, ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
      const data=await response.json();
      if(!response.ok)throw Object.assign(new Error(data.error?.message??'Could not check map analysis.'),{status:response.status});
      return data as AnalysisState;
    }
    function accept(data:AnalysisState) {
      if(!active)return;
      setState(data);
      if(data.key) { try { localStorage.setItem(storageKey,data.key); } catch {} }
      if(data.key && (data.status==='running'||data.status==='ready'&&!data.graph)) timer=setTimeout(()=>void poll(data.key!),data.status==='ready'?0:3000);
    }
    function failed(error:unknown) {
      if(!active)return;
      const status=error instanceof Error && 'status' in error ? error.status : undefined;
      setState({status:status===503?'unavailable':'failed',stage:status===503?'Map analysis is unavailable here':'Could not check book map',error:`${error instanceof Error?error.message:'Connection failed.'}${status===undefined?' Analysis may still be running; retry to reconnect.':''}`});
    }
    async function poll(key:string) { try { accept(await request(`/api/book-analysis?key=${key}`)); } catch(error){failed(error);} }
    async function start() {
      try {
        let saved:string|null=null;try{saved=localStorage.getItem(storageKey);}catch{}
        if(saved && !attempt) {
          const data=await request(`/api/book-analysis?key=${saved}`);
          if(data.status!=='idle'){accept(data);return;}
        }
        accept(await request('/api/book-analysis',{bookId,sourceText:preview.sourceText,fileHash:preview.fileHash,extractionVersion:preview.extractionVersion}));
      } catch(error){failed(error);}
    }
    void start();
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[bookId,preview,enabled,attempt]);
  return { ...state, retry:()=>{setState({status:'starting',stage:'Reconnecting to book analysis'});setAttempt(value=>value+1);} };
}
