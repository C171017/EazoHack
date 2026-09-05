'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapView, SourceAnchor } from '@/shared/schemas';
import { ZOOM_POLICY, type MapBootstrap, type MapEntry, type MapLink, type NodeDetail } from '@/shared/zoom-hierarchy';
import { initialView, LEVELS, magneticPose, nearestProjection, orbitFrom, SNAP_ENTER, SNAP_EXIT, springProgress, orientation, placeLabels, PROJECTIONS, project, type Point3 } from './projection';
import { baseScale, semanticWindow, toScreen, zoomAt, zoomLevel } from './semantic-window';
import { readMap, useMapPages, useMapRequest } from './map-data';
import { useNodeTransition } from './node-transition';
const COLORS=['#caaf7c','#84b7ad','#a398cb','#8baecc','#ba9a9c','#99b687','#b5ac83'];
export function BookMap({graph,excerptRange,view,onViewChange,onSource,onSaveView}:{
  graph:MapBootstrap;excerptRange:[number,number];view:MapView|null;
  onViewChange:(view:MapView)=>void;onSource:(anchor:SourceAnchor)=>void;onSaveView:()=>void;
}) {
  const current=useMemo<MapView>(()=>view?.graphVersion===graph.graphVersion&&(!view.hierarchyVersion||view.hierarchyVersion===graph.version)?{...view,hierarchyVersion:graph.version,selectedNodeId:!view.hierarchyVersion&&view.selectedNodeId?.startsWith('h-')?null:view.selectedNodeId}:{...initialView(graph.graphVersion),hierarchyVersion:graph.version,sourceScope:'book' as const},[view,graph.graphVersion,graph.version]);
  const [size,setSize]=useState({width:800,height:550}),[list,setList]=useState(false),[query,setQuery]=useState(''),[browsePage,setBrowsePage]=useState(0);
  const [previousLevel,setPreviousLevel]=useState(0),[navigationError,setNavigationError]=useState<string|null>(null);
  const [navigating,setNavigating]=useState(false);
  const level=zoomLevel(current.zoom,previousLevel,graph.depth);
  const range:[number,number]=current.sourceScope==='excerpt'?excerptRange:[0,1];
  const data=useMapPages(graph.version,pages=>semanticWindow(graph.roots,pages,current,size,range,level));
  const {windowed,install}=data;
  const index=useMemo(()=>new Map([...graph.roots,...[...data.pages.values()].flat()].map(n=>[n.id,n])),[graph.roots,data.pages]);
  const animated=useNodeTransition(windowed.nodes,index);
  const restoredPath=useMapRequest<{node:MapEntry;pages:Record<string,MapEntry[]>}>(graph.version,current.selectedNodeId&&!index.has(current.selectedNodeId)?{kind:'locate',id:current.selectedNodeId}:null);
  useEffect(()=>{if(restoredPath.data)install(restoredPath.data.pages);},[restoredPath.data,install]);
  const selectedEntry=index.get(current.selectedNodeId??'')??restoredPath.data?.node;
  const selectedAncestors=new Set<string>();let ancestor=selectedEntry?.parentId;while(ancestor){selectedAncestors.add(ancestor);ancestor=index.get(ancestor)?.parentId;}
  const detail=useMapRequest<{detail:NodeDetail}>(graph.version,current.selectedNodeId&&selectedEntry?.kind==='occurrence'?{kind:'detail',id:current.selectedNodeId}:null);
  const selected=detail.data?.detail;
  const edges=useMapRequest<{links:MapLink[];total:number}>(graph.version,list?null:{kind:'edges',id:windowed.nodes.map(n=>n.id),theme:current.themeFilter??'',role:current.roleFilter??'',start:String(range[0]),end:String(range[1])},140);
  const browse=useMapRequest<{nodes:MapEntry[];total:number}>(graph.version,list?{kind:'browse',page:String(browsePage),q:query,theme:current.themeFilter??'',role:current.roleFilter??'',start:String(range[0]),end:String(range[1])}:null,160);
  const stage=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),frame=useRef<number|null>(null);
  const latest=useRef({current,size}),navigation=useRef<AbortController|null>(null);
  const drag=useRef<{id:number;x:number;y:number;view:MapView;latest:MapView;pan:boolean;exited:boolean;moved:boolean}|null>(null);
  useEffect(()=>{latest.current={current,size};},[current,size]);
  useEffect(()=>{const f=requestAnimationFrame(()=>setPreviousLevel(level));return()=>cancelAnimationFrame(f);},[level]);
  useEffect(()=>{
    const element=stage.current;if(!element)return;
    const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({width,height});});observer.observe(element);return()=>observer.disconnect();
  },[]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);navigation.current?.abort();},[]);
  // Native non-passive listener is required for trackpad pinch (ctrl+wheel).
  // Plain two-finger scrolling pans. Neither operation asks the server to fit.
  useEffect(()=>{
    const element=svg.current;if(!element)return;
    let gesture:{view:MapView;size:typeof size;focus:{x:number;y:number}}|null=null;
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();if(gesture)return;if(frame.current!==null)cancelAnimationFrame(frame.current);
      navigation.current?.abort();setNavigating(false);
      const {current:view,size}=latest.current,rect=element.getBoundingClientRect();
      const unit=event.deltaMode===1?16:event.deltaMode===2?size.height:1;
      const next=event.ctrlKey||event.metaKey?zoomAt(view,view.zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY*unit))*.012),{x:event.clientX-rect.left,y:event.clientY-rect.top},size):{...view,x:view.x-event.deltaX*unit,y:view.y-event.deltaY*unit};
      latest.current={current:next,size};onViewChange(next);
    };
    const gestureStart=(event:Event)=>{
      event.preventDefault();if(frame.current!==null)cancelAnimationFrame(frame.current);navigation.current?.abort();setNavigating(false);
      const e=event as Event&{clientX?:number;clientY?:number},rect=element.getBoundingClientRect(),{current:view,size}=latest.current;
      gesture={view,size,focus:{x:e.clientX===undefined?size.width/2:e.clientX-rect.left,y:e.clientY===undefined?size.height/2:e.clientY-rect.top}};
    };
    const gestureChange=(event:Event)=>{event.preventDefault();if(!gesture)return;const scale=(event as Event&{scale:number}).scale;if(!Number.isFinite(scale)||scale<=0)return;const next=zoomAt(gesture.view,gesture.view.zoom*scale,gesture.focus,gesture.size);latest.current={current:next,size:gesture.size};onViewChange(next);};
    const gestureEnd=(event:Event)=>{event.preventDefault();gesture=null;};
    element.addEventListener('wheel',wheel,{passive:false});
    element.addEventListener('gesturestart',gestureStart,{passive:false});element.addEventListener('gesturechange',gestureChange,{passive:false});element.addEventListener('gestureend',gestureEnd,{passive:false});
    return()=>{element.removeEventListener('wheel',wheel);element.removeEventListener('gesturestart',gestureStart);element.removeEventListener('gesturechange',gestureChange);element.removeEventListener('gestureend',gestureEnd);};
  },[onViewChange,list]);
  const cancelMotion=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;};
  const change=(patch:Partial<MapView>)=>{cancelMotion();navigation.current?.abort();setNavigating(false);const next={...latest.current.current,...patch};latest.current={...latest.current,current:next};onViewChange(next);};
  function settle(from:MapView,target:Pick<MapView,'projection'|'yaw'|'pitch'>) {
    cancelMotion();const finish={...from,...target};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onViewChange(finish);return;}
    let start:number|undefined;const animate=(now:number)=>{
      start??=now;const elapsed=now-start,ease=springProgress(elapsed);
      onViewChange(elapsed>=520?finish:{...from,projection:'3d',yaw:from.yaw+(target.yaw-from.yaw)*ease,pitch:from.pitch+(target.pitch-from.pitch)*ease});
      if(elapsed<520)frame.current=requestAnimationFrame(animate);else frame.current=null;
    };frame.current=requestAnimationFrame(animate);
  }
  function finishDrag(){const d=drag.current;drag.current=null;if(!d||d.pan||!d.moved)return;const target=nearestProjection(d.latest),threshold=d.view.projection!=='3d'&&!d.exited?SNAP_EXIT:SNAP_ENTER;if(target.distance<=threshold&&(!d.exited||target.projection!==d.view.projection))settle(d.latest,target);}
  function zoom(factor:number){const {current:view,size}=latest.current;change(zoomAt(view,view.zoom*factor,{x:size.width/2,y:size.height/2},size));}
  function openCluster(node:MapEntry) {
    const centre=node.position?toScreen(node.position,current,size,range):{x:size.width/2,y:size.height/2};
    const next=zoomAt(current,Math.max(current.zoom*1.65,ZOOM_POLICY.step**(level+1)*1.04),centre,size);
    change({...next,x:next.x+size.width/2-centre.x,y:next.y+size.height/2-centre.y,selectedNodeId:node.id});
  }
  async function locate(id:string) {
    navigation.current?.abort();const controller=new AbortController();navigation.current=controller;setNavigationError(null);setNavigating(true);cancelMotion();
    try {
      const result=await readMap<{node:MapEntry;ancestors:string[];pages:Record<string,MapEntry[]>}>(graph.version,{kind:'locate',id},controller.signal);
      if(controller.signal.aborted)return;
      data.install(result.pages);
      const zoom=Math.max(1,ZOOM_POLICY.step**result.ancestors.length*1.06),next={...latest.current.current,selectedNodeId:id,themeFilter:null,roleFilter:null,sourceScope:'book' as const,zoom,x:0,y:0};
      if(result.node.position){const p=toScreen(result.node.position,next,size,[0,1]);next.x=size.width/2-p.x;next.y=size.height/2-p.y;}
      onViewChange(next);setList(false);
    }catch(error){if(!controller.signal.aborted)setNavigationError(error instanceof Error?error.message:'Could not reveal node');}
    finally{if(!controller.signal.aborted)setNavigating(false);}
  }
  const points=animated.flatMap(item=>{
    if(!item.position)return [];
    const p=toScreen(item.position,current,size,range);
    if(item.node.kind==='occurrence'&&(p.x<0||p.y<0||p.x>size.width||p.y>size.height))return [];
    return [{...item,id:item.node.id,label:item.node.label,x:Math.max(24,Math.min(size.width-24,p.x)),y:Math.max(48,Math.min(size.height-24,p.y))}];
  });
  const labelCap=Math.max(1,Math.min(ZOOM_POLICY.labels,Math.floor((size.width-16)/218)*Math.floor((size.height-80)/34)));
  const labelPoints=[...points].filter(p=>!p.exiting).sort((a,b)=>Number(b.id===current.selectedNodeId)-Number(a.id===current.selectedNodeId)||Number(b.node.kind==='cluster')-Number(a.node.kind==='cluster')).slice(0,labelCap);
  const labels=new Map(placeLabels(labelPoints,size.width,size.height).map(p=>[p.id,p]));
  const screen=(p:Point3)=>{const q=project(p,current),scale=baseScale(size)*current.zoom;return {x:size.width/2+q.x*scale+current.x,y:size.height/2+q.y*scale+current.y};};
  const grid=useMemo(()=>Array.from({length:11},(_,i)=>[{a:{x:-250+i*50,y:-170,z:-200},b:{x:-250+i*50,y:-170,z:200}},{a:{x:-250,y:-170,z:-200+i*40},b:{x:250,y:-170,z:-200+i*40}}]).flat(),[]);
  const source=(anchor:SourceAnchor)=>{change({readerAnchorId:anchor.id});onSource(anchor);};
  return <div className="book-map" onKeyDown={e=>{
    if((e.target as HTMLElement).closest('input,select,textarea'))return;
    const i=['1','2','3','4'].indexOf(e.key);if(i>=0){e.preventDefault();const projection=PROJECTIONS[i].id;settle(current,{projection,...orientation(projection)});}
    if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.35);}if(e.key==='-'){e.preventDefault();zoom(1/1.35);}
  }}>
    <div className="map-topbar"><div><small>THE REPUBLIC · BOOK ATLAS</small><h2>{list?'Find a passage or idea':level===0?'The shape of the book':level<graph.depth?'Inside the ideas':'A closer reading'}</h2></div><button className="map-browse-button" aria-pressed={list} onClick={()=>setList(!list)}>{list?'Return to map':`Browse ${graph.totalNodes} notes`}</button></div>
    <div ref={stage} className="map-stage">
      {list?<div className="map-browser"><input aria-label="Search notes" placeholder="Search the book’s ideas…" value={query} onChange={e=>{setQuery(e.target.value);setBrowsePage(0);}}/>
        <div className="map-node-list" aria-label="Filtered map occurrences">{browse.data?.nodes.map(n=><button key={n.id} onClick={()=>void locate(n.id)} aria-pressed={current.selectedNodeId===n.id}><span>{n.label}</span><small>{n.sourceLabel}</small></button>)}</div>
        <div className="map-pagination"><button disabled={browsePage===0} onClick={()=>setBrowsePage(p=>p-1)}>Previous</button><span>{browse.loading?'Loading…':`${browse.data?.total??0} notes · page ${browsePage+1}`}</span><button disabled={!browse.data||(browsePage+1)*ZOOM_POLICY.pageSize>=browse.data.total} onClick={()=>setBrowsePage(p=>p+1)}>Next</button></div>{browse.error&&<p role="alert">{browse.error} <button onClick={browse.retry}>Retry</button></p>}
      </div>:<svg ref={svg} width="100%" height="100%" role="group" tabIndex={0} aria-label="Book map: pinch to explore layers" data-camera-yaw={current.yaw} data-camera-pitch={current.pitch} data-camera-zoom={current.zoom} data-projection={current.projection} data-level={level} data-visible-count={windowed.nodes.length} data-cache-pages={data.pages.size} data-rendered-count={points.length}
        onKeyDown={e=>{if(e.target===e.currentTarget&&e.key.startsWith('Arrow')){e.preventDefault();change({...orbitFrom(current,e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0),projection:'3d'});}}}
        onKeyUp={e=>{if(e.target===e.currentTarget&&e.key.startsWith('Arrow')){const target=nearestProjection(current);if(target.distance<=SNAP_ENTER)settle(current,target);}}}
        onPointerDown={e=>{if(drag.current||(e.target as Element).closest('[data-node-id]')||e.button!==0)return;cancelMotion();navigation.current?.abort();setNavigating(false);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:current,latest:current,pan:e.shiftKey,exited:false,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.hypot(dx,dy)<3&&!d.moved)return;d.moved=true;if(d.pan){d.latest={...d.view,x:d.view.x+dx,y:d.view.y+dy};onViewChange(d.latest);return;}const raw=orbitFrom(d.view,dx,dy);if(d.view.projection!=='3d'&&Math.hypot(raw.yaw-d.view.yaw,raw.pitch-d.view.pitch)>SNAP_EXIT)d.exited=true;d.latest={...d.view,projection:'3d',...(d.view.projection!=='3d'?raw:magneticPose(raw))};onViewChange(d.latest);}}
        onPointerUp={e=>{finishDrag();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        <desc>Pinch to expand or group ideas. Scroll with two fingers to pan. Drag to orbit; Shift-drag pans. Plus and minus zoom. Keys 1 to 4 switch projections. Larger circles summarize multiple notes. Height means structure, not importance.</desc>
        <defs><marker id="map-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#8ca996"/></marker></defs>
        <g className="map-grid" aria-hidden="true">{grid.map((l,i)=>{const a=screen(l.a),b=screen(l.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}</g>
        <g aria-hidden="true">{[{label:'X · Themes',end:{x:280,y:-170,z:-200}},{label:'Y · Structure',end:{x:-250,y:195,z:-200}},{label:'Z · Source',end:{x:-250,y:-170,z:230}}].map((a,i)=>{
          if(current.projection==='xy'&&i===2||current.projection==='xz'&&i===1||current.projection==='yz'&&i===0)return null;
          const start=screen({x:-250,y:-170,z:-200}),end=screen(a.end);return <g key={a.label}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={COLORS[i]} opacity=".4"/><text x={end.x+8} y={end.y-8} fill={COLORS[i]} className="map-axis-title">{a.label}</text></g>;
        })}</g>
        <g aria-hidden="true">{edges.data?.links.map(edge=>{const a=points.find(p=>p.id===edge.source&&!p.exiting),b=points.find(p=>p.id===edge.target&&!p.exiting);return a&&b?<line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="map-edge" markerEnd="url(#map-arrow)"><title>{edge.type} · {edge.count} source relations</title></line>:null;})}</g>
        {points.map(p=>{const color=COLORS[Math.max(0,graph.territories.findIndex(t=>t.id===p.node.themeIds[0]))%COLORS.length],label=labels.get(p.id),cluster=p.node.kind==='cluster';let depth=0,parent=p.node.parentId;while(parent){depth++;parent=index.get(parent)?.parentId??null;}const radius=p.radius*Math.max(.75,Math.min(1.1,Math.sqrt(current.zoom/ZOOM_POLICY.step**depth)));return <g key={p.id} opacity={p.opacity} pointerEvents={p.exiting?'none':undefined} aria-hidden={p.exiting||undefined}>
          {label&&<line x1={p.x} y1={p.y} x2={label.labelX} y2={label.labelY+13} stroke={color} opacity=".25"/>}
          <g data-node-id={p.id} data-node-kind={p.node.kind} className={`map-node${current.selectedNodeId===p.id||selectedAncestors.has(p.id)?' is-selected':''}`} role="button" tabIndex={p.exiting?-1:0} aria-label={`${p.label}${cluster?`, group of ${p.node.leafCount} notes. Activate to expand`:`, ${p.node.sourceLabel}`}`} aria-pressed={current.selectedNodeId===p.id||selectedAncestors.has(p.id)} onClick={()=>cluster?openCluster(p.node):change({selectedNodeId:p.id})} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(cluster)openCluster(p.node);else change({selectedNodeId:p.id});}if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const direction=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;const target=windowed.nodes[(windowed.nodes.findIndex(n=>n.id===p.id)+direction+windowed.nodes.length)%windowed.nodes.length];if(target)svg.current?.querySelector<SVGGElement>(`[data-node-id="${target.id}"]`)?.focus();}}}>
            <title>{p.label} · {cluster?`${p.node.leafCount} notes · ${p.node.summary}`:p.node.sourceLabel}</title>
            <circle cx={p.x} cy={p.y} r={radius+9} fill={color} opacity=".08"/>
            <circle cx={p.x} cy={p.y} r={radius} fill={cluster?'#17281e':color} stroke={color} strokeWidth="1.2"/>
            {cluster&&<text x={p.x} y={p.y+3} textAnchor="middle" className="map-cluster-count">{p.node.leafCount}</text>}
            {label&&<><rect x={label.labelX} y={label.labelY} width={label.width} height="26" rx="5"/><text x={label.labelX+8} y={label.labelY+17}>{p.label.length>31?`${p.label.slice(0,30)}…`:p.label}</text></>}
          </g>
        </g>;})}
      </svg>}
      {!list&&<><div className="map-zoom-controls"><button aria-label="Zoom out" onClick={()=>zoom(1/1.35)}>−</button><span>{Math.round(current.zoom*100)}%</span><button aria-label="Zoom in" onClick={()=>zoom(1.35)}>+</button><button aria-label="Reset view" onClick={()=>change({...initialView(graph.graphVersion),sourceScope:current.sourceScope,themeFilter:current.themeFilter,roleFilter:current.roleFilter})}>↺</button></div>
        <div className="map-layer-status" aria-live="polite">{data.error?<><span>{data.error}</span> <button onClick={data.retry}>Retry loading</button></>:windowed.wanted.length?'Opening this part of the book…':`${windowed.nodes.length} visible · detail ${level} of ${graph.depth}`} {!windowed.nodes.length&&!windowed.wanted.length&&<button onClick={()=>change({x:0,y:0,zoom:1})}>Return to overview</button>}</div></>}
    </div>
    {restoredPath.error&&<p role="alert">{restoredPath.error} <button onClick={restoredPath.retry}>Retry</button></p>}{navigationError&&<p role="alert">{navigationError}</p>}{navigating&&<p role="status">Finding this note…</p>}
    {current.selectedNodeId&&<section className="map-detail" aria-label={selectedEntry?.kind==='cluster'?'Selected group':'Selected occurrence'}>
      <div className="map-title-row"><div><small>{selectedEntry?.kind==='cluster'?`${selectedEntry.leafCount} notes · generated summary`:selected?.node.sourceLabel??'Source occurrence'}</small><h3>{selectedEntry?.label??selected?.node.label??'Loading note…'}</h3></div><button aria-label="Close node details" onClick={()=>change({selectedNodeId:null})}>×</button></div>
      {selectedEntry?.kind==='cluster'?<><p>{selectedEntry.summary}</p><button className="map-source-button" onClick={()=>openCluster(selectedEntry)}>Explore this group ↗</button><small> Grouping summarizes its children; it is not a new source passage.</small></>:detail.error?<p role="alert">{detail.error} <button onClick={detail.retry}>Retry</button></p>:selected?<div className="map-detail-body"><div><blockquote>{selected.anchors.find(a=>a.id===selected.node.anchorIds[0])?.quote}</blockquote><p>{selected.node.structuralLevel===null?'Unclassified':LEVELS[selected.node.structuralLevel]}</p></div><div><p>{selected.node.summary}</p>{selected.node.anchorIds.map((id,i)=>{const a=selected.anchors.find(a=>a.id===id);return a?<button className="map-source-button" key={id} onClick={()=>source(a)}>{i?'Additional evidence':'Read this passage'} ↗ </button>:null;})}
        <p>Shared concept: {selected.identity.label}</p><div className="map-related">{selected.identity.occurrenceIds.filter(id=>id!==selected.node.id).map(id=><button key={id} onClick={()=>void locate(id)}>{selected.neighbours.find(n=>n.id===id)?.label} ↗</button>)}</div>
        <details><summary>Position & relation evidence</summary><p>{selected.node.evidence.rationale}</p>{selected.edges.map(e=><p key={e.id}><button onClick={()=>void locate(e.source===selected.node.id?e.target:e.source)}>{selected.neighbours.find(n=>n.id===e.source)?.label} → {e.type} → {selected.neighbours.find(n=>n.id===e.target)?.label}</button><br/>{e.rationale}{e.evidenceAnchorIds.map(id=>{const a=selected.anchors.find(a=>a.id===id);return a?<button className="map-source-button" key={id} onClick={()=>source(a)}>Relation evidence ↗ </button>:null;})}</p>)}</details></div></div>:<p>Loading source evidence…</p>}
    </section>}
    <footer className="map-footer"><div className="map-filters"><label>Theme <select aria-label="Theme filter" value={current.themeFilter??''} onChange={e=>{setBrowsePage(0);change({themeFilter:e.target.value||null});}}><option value="">All themes</option>{graph.territories.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Text <select aria-label="Text type filter" value={current.roleFilter??''} onChange={e=>{setBrowsePage(0);change({roleFilter:(e.target.value||null) as MapView['roleFilter']});}}><option value="">All source text</option><option value="dialogue">Dialogue</option><option value="commentary">Commentary</option><option value="paratext">Front matter / apparatus</option></select></label></div>
      <div className="map-footer-row"><label>Source range <select aria-label="Source range" value={current.sourceScope} onChange={e=>{setBrowsePage(0);change({sourceScope:e.target.value as MapView['sourceScope']});}}><option value="excerpt">Book I opening · expanded</option><option value="book">Entire source file</option></select></label><button className="map-save-view" onClick={onSaveView}>Save view</button></div>
      <p>Pinch to explore · two-finger scroll to pan · drag to rotate · + / − to zoom</p><p>{current.projection==='3d'?'3D · Drag near a plane to snap':PROJECTIONS.find(p=>p.id===current.projection)?.hint} · Shift-drag pans · keys 1–4 change projection</p>
      <p className="map-disclosure">{(current.themeFilter||current.roleFilter)&&'Groups include matching notes; group counts describe all descendants. '}{graph.analysis?.model} · {graph.totalNodes} source notes · {graph.depth+1} layers. Larger circles summarize notes. Height means structure, not importance. Model-reviewed; not human-verified.{graph.unplaced>0&&` ${graph.unplaced} unplaced notes remain in Browse.`}{(edges.data?.total??0)>ZOOM_POLICY.edges&&` Showing ${ZOOM_POLICY.edges} of ${edges.data!.total} relation groups.`}</p>
    </footer>
  </div>;
}
