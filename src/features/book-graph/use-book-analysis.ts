'use client';
import { useEffect, useState } from 'react';
import type { BookPreview } from '../reader/book-preview';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { cloudRequest } from '../cloud/request';
import { startHostedAnalysis, type HostedStatus } from './hosted-analysis';
import { analysisRequest } from './analysis-request';
type AnalysisState = { status: 'starting' | 'running' | 'ready' | 'failed' | 'idle' | 'unavailable'; stage: string; error?: string; key?: string; graph?: MapBootstrap; updatedAt?: number };
export function useBookAnalysis(bookId: string, preview: BookPreview, enabled: boolean, title = bookId, cloudSourceId?: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AnalysisState>({status:'starting',stage:'Starting book map analysis'});
  useEffect(() => {
    if (!enabled) return;
    let active=true, timer:ReturnType<typeof setTimeout> | undefined;
    const controller=new AbortController();
    const storageKey=`eazo-map-job:${bookId}:${preview.extractionVersion}`;
    async function request(url:string, body?:object) {
      return analysisRequest<AnalysisState>(url, {signal:controller.signal,body,reconnect:()=>{
        if(active)setState(previous=>({...previous,stage:'Connection interrupted. Reconnecting to your book analysis…'}));
      }});
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
    async function hosted() {
      try {
        const {source,owner}=await startHostedAnalysis({kind:'txt',title,bookId,preview},cloudSourceId,attempt>0);
        async function check() {
          if(!active)return;
          try {
            const data:HostedStatus=await cloudRequest(`analysis-status?source=${encodeURIComponent(source)}`,undefined,owner,{signal:controller.signal});
            if(!active)return;
            if(data.status==='ready') {
              await cloudRequest('open',{source},owner,{signal:controller.signal});
              if(active)window.location.replace(new URL('/?book=cloud',window.location.origin).href);
              return;
            }
            if(['failed','cancelled'].includes(data.status)) {
              setState({status:'failed',stage:'Book map needs attention',error:data.error??'Analysis stopped. Retry to start it again.'});return;
            }
            setState({status:'running',stage:data.status==='running'?'Analyzing your book and arranging its map':'Book map queued for analysis'});
            timer=setTimeout(()=>void check(),3000);
          } catch(error){failed(error);}
        }
        await check();
      }catch(error){failed(error);}
    }
    // Production imports use the authenticated worker, never the development-only endpoint.
    if (process.env.NODE_ENV === 'production' && !cloudSourceId) {
      queueMicrotask(() => { if (active) setState({ status: 'unavailable', stage: 'Add this book to your account to build a synced map.' }); });
    } else if (cloudSourceId) void hosted(); else void start();
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[bookId,preview,enabled,attempt,title,cloudSourceId]);
  return { ...state, retry:()=>{setState({status:'starting',stage:'Reconnecting to book analysis'});setAttempt(value=>value+1);} };
}
