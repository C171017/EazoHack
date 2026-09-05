'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Graph, MapView, SourceAnchor } from '@/shared/schemas';
import { initialView, LEVELS, magneticPose, nearestProjection, orbitFrom, SNAP_ENTER, SNAP_EXIT, springProgress, orientation, placeLabels, PROJECTIONS, project, worldPoint, type Point3 } from './projection';
import { mapWindow, SPATIAL_PAGE_SIZE } from './map-window';

const COLORS = ['#caaf7c','#84b7ad','#a398cb'];
const AXES = [{key:'x',label:'X · Themes',color:'#caaf7c'},{key:'y',label:'Y · Structure',color:'#84b7ad'},{key:'z',label:'Z · Source order',color:'#a398cb'}] as const;
export function BookMap({graph,excerptRange,view,onViewChange,onSource,onSaveView}: {
  graph:Graph; excerptRange:[number,number]; view:MapView|null;
  onViewChange:(view:MapView)=>void; onSource:(anchor:SourceAnchor)=>void; onSaveView:()=>void;
}) {
  const current = view?.graphVersion === graph.graphVersion ? view : {...initialView(graph.graphVersion), sourceScope: graph.analysis ? 'book' as const : 'excerpt' as const};
  const [size,setSize] = useState({width:800,height:550});
  const windowed = mapWindow(graph, current, excerptRange);
  const [list,setList] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const frame = useRef<number|null>(null);
  const drag = useRef<{id:number;x:number;y:number;view:MapView;latest:MapView;pan:boolean;exited:boolean;moved:boolean}|null>(null);
  useEffect(()=>{
    const element=stage.current;
    if(!element)return;
    const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({width,height});});
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);},[]);
  const cancelMotion = () => {if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;};
  const change = (patch:Partial<MapView>) => {cancelMotion();onViewChange({...current,...patch});};
  function settle(from:MapView,target:Pick<MapView,'projection'|'yaw'|'pitch'>) {
    cancelMotion();
    const finish={...from,projection:target.projection,yaw:target.yaw,pitch:target.pitch};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onViewChange(finish);return;}
    let start:number|undefined;
    const animate=(now:number)=>{
      start ??= now;
      const elapsed=now-start,ease=springProgress(elapsed);
      onViewChange(elapsed>=520?finish:{...from,projection:'3d',yaw:from.yaw+(target.yaw-from.yaw)*ease,pitch:from.pitch+(target.pitch-from.pitch)*ease});
      if(elapsed<520)frame.current=requestAnimationFrame(animate);else frame.current=null;
    };
    frame.current=requestAnimationFrame(animate);
  }
  function switchProjection(projection:MapView['projection']) {
    const pose=orientation(projection);
    settle(current,{projection,...pose});
  }
  function finishDrag() {
    const d=drag.current;drag.current=null;
    if(!d||d.pan||!d.moved)return;
    const target=nearestProjection(d.latest);
    const threshold=d.view.projection!=='3d'&&!d.exited?SNAP_EXIT:SNAP_ENTER;
    if(target.distance<=threshold&&(!d.exited||target.projection!==d.view.projection))settle(d.latest,target);
  }
  const range:[number,number] = current.sourceScope==='excerpt'?excerptRange:[0,1];
  const bounds=[-280,280].flatMap(x=>[-200,200].flatMap(y=>[-230,230].map(z=>project({x,y,z},current))));
  const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x));
  const minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
  const scale=Math.max(.05,Math.min((size.width-240)/(maxX-minX),(size.height-120)/(maxY-minY)))*current.zoom;
  const screen=(p:Point3)=>{
    const q=project(p,current);
    return {x:size.width/2+q.x*scale+current.x,y:size.height/2+q.y*scale+current.y,depth:q.depth};
  };
  const points=windowed.spatial.flatMap(node=>{
    const p=worldPoint(node,range);
    return p?[{...node,...screen(p)}]:[];
  });
  const labels=placeLabels(points,size.width,size.height);
  const selected=graph.nodes.find(n=>n.id===current.selectedNodeId);
  const identity=graph.identities.find(i=>i.id===selected?.identityId);
  const selectedAnchor=graph.anchors.find(a=>a.id===selected?.anchorIds[0]);
  const related=graph.edges.filter(e=>e.source===selected?.id||e.target===selected?.id);
  const unknown=graph.nodes.filter(n=>Object.values(n.position).some(v=>v===null));
  const grid=useMemo(()=>{
    const lines:{a:Point3;b:Point3}[]=[];
    for(let i=0;i<=10;i++){
      const x=-250+i*50,z=-200+i*40;
      lines.push({a:{x,y:-170,z:-200},b:{x,y:-170,z:200}},{a:{x:-250,y:-170,z},b:{x:250,y:-170,z}});
      lines.push({a:{x,y:-170,z:200},b:{x,y:170,z:200}});
    }
    for(let i=0;i<=4;i++){
      const y=-170+i*85;
      lines.push({a:{x:-250,y,z:200},b:{x:250,y,z:200}},{a:{x:-250,y,z:-200},b:{x:-250,y,z:200}});
    }
    return lines;
  },[]);
  const origin:Point3={x:-250,y:-170,z:-200};
  const ends:Point3[]=[{...origin,x:280},{...origin,y:195},{...origin,z:230}];
  const choose=(id:string,focus=false)=>{
    const filteredIndex=windowed.filtered.findIndex(n=>n.id===id);
    cancelMotion();change(filteredIndex>=0?{selectedNodeId:id,nodePage:Math.floor(filteredIndex/SPATIAL_PAGE_SIZE)}:{selectedNodeId:id,themeFilter:null,roleFilter:null,sourceScope:'book',nodePage:Math.floor(graph.nodes.findIndex(n=>n.id===id)/SPATIAL_PAGE_SIZE)});
    if(focus)requestAnimationFrame(()=>svg.current?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus());
  };
  function moveNode(id:string,direction:number) {
    const neighbours=graph.edges.flatMap(e=>direction>0&&e.source===id?[e.target]:direction<0&&e.target===id?[e.source]:[]);
    const target=neighbours.length?neighbours[direction<0?neighbours.length-1:0]:graph.nodes[(graph.nodes.findIndex(n=>n.id===id)+direction+graph.nodes.length)%graph.nodes.length]?.id;
    if(target)choose(target,true);
  }
  return <div className="book-map" onKeyDown={e=>{
    if((e.target as HTMLElement).closest('input,select,textarea'))return;
    const index=['1','2','3','4'].indexOf(e.key);
    if(index>=0){e.preventDefault();switchProjection(PROJECTIONS[index].id);}
  }}>
    <div ref={stage} className="map-stage">
      <button className="map-small-button" aria-pressed={list} onClick={()=>setList(!list)}>{list?'Show space':`Browse nodes (${windowed.filtered.length})`}</button>
      {list?<div className="map-node-list" aria-label="Filtered map occurrences">{windowed.filtered.map(n=><button key={n.id} aria-pressed={selected?.id===n.id} onClick={()=>choose(n.id)}><span>{n.label}</span><small>{n.sourceLabel} · {n.structuralLevel===null?'Unclassified':LEVELS[n.structuralLevel]}</small></button>)}{!windowed.filtered.length&&<p>No occurrences match these filters.</p>}</div>:
      <svg data-camera-yaw={current.yaw} data-camera-pitch={current.pitch} data-projection={current.projection} ref={svg} width="100%" height="100%" aria-label="Book map: orbitable 3D coordinates with three projections" role="group" tabIndex={0}
        onKeyDown={e=>{
          if(e.target!==e.currentTarget)return;
          if(e.key.startsWith('Arrow')){e.preventDefault();cancelMotion();onViewChange({...current,projection:'3d',...orbitFrom(current,e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0)});}
        }}
        onKeyUp={e=>{
          if(e.target!==e.currentTarget||!e.key.startsWith('Arrow'))return;
          const target=nearestProjection(current);if(target.distance<=SNAP_ENTER)settle(current,target);
        }}
        onPointerDown={e=>{
          if(drag.current||(e.target as Element).closest('[data-node-id]')||e.button!==0)return;
          cancelMotion();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:current,latest:current,pan:e.shiftKey,exited:false,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          const d=drag.current;if(!d||d.id!==e.pointerId)return;
          const dx=e.clientX-d.x,dy=e.clientY-d.y;
          if(Math.hypot(dx,dy)<3&&!d.moved)return;
          d.moved=true;
          if(d.pan){d.latest={...d.view,x:d.view.x+dx,y:d.view.y+dy};onViewChange(d.latest);return;}
          const raw=orbitFrom(d.view,dx,dy);
          if(d.view.projection!=='3d'&&Math.hypot(raw.yaw-d.view.yaw,raw.pitch-d.view.pitch)>SNAP_EXIT)d.exited=true;
          const pose=d.view.projection!=='3d'?raw:magneticPose(raw);
          d.latest={...d.view,projection:'3d',...pose};onViewChange(d.latest);
        }}
        onPointerUp={e=>{finishDrag();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        <desc>X is thematic territory. Y rises from detail to organizing structure, not importance. Z is source order, not historical time. Drag to orbit and magnetically align to a projection. Drag away to leave it; Shift-drag pans. Arrow keys orbit; node arrows follow relations. Keyboard shortcuts 1 to 4 remain available.</desc>
        <g className="map-grid" aria-hidden="true">{grid.map((l,i)=>{const a=screen(l.a),b=screen(l.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}</g>
        <g aria-hidden="true">{AXES.map((axis,i)=>{
          if(current.projection==='xy'&&i===2||current.projection==='xz'&&i===1||current.projection==='yz'&&i===0)return null;
          const a=screen(origin),b=screen(ends[i]);
          return <g key={axis.key}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis.color} strokeWidth="1.5"/><text x={b.x+8} y={b.y-12} fill={axis.color} className="map-axis-title">{axis.label}</text></g>;
        })}</g>
        <g className="map-axis-ticks" aria-hidden="true">
          {current.projection!=='yz'&&graph.territories.map((t,i)=>{const p=screen({...origin,x:(t.centroidX-.5)*500});return <text key={t.id} x={p.x} y={p.y+26} textAnchor="middle" fill={COLORS[i%3]}><title>{t.label}</title>{t.label.length>24?`${t.label.slice(0,23)}…`:t.label}</text>;})}
          {current.projection!=='xz'&&LEVELS.map((label,i)=>{const p=screen({...origin,y:(i/4-.5)*340});return <text key={label} x={p.x-10} y={p.y+4} textAnchor="end">{i} · {label}</text>;})}
          {current.projection!=='xy'&&[0,1].map(t=>{const p=screen({...origin,z:(t-.5)*400});return <text key={t} x={p.x} y={p.y+44} textAnchor="middle">{current.sourceScope==='excerpt'?(t?'329D · excerpt end':'327A · excerpt start'):(t?'Source end':'Source beginning')}</text>;})}
        </g>
        <g aria-hidden="true">{graph.edges.map(edge=>{
          const a=points.find(p=>p.id===edge.source),b=points.find(p=>p.id===edge.target);if(!a||!b)return null;
          return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={related.includes(edge)?'map-edge is-active':'map-edge'}/>;
        })}</g>
        {labels.map(p=>{const color=COLORS[graph.territories.findIndex(t=>t.id===p.themeTerritoryIds[0])%3]??'#aaa';return <g key={p.id}>
          <g aria-hidden="true" pointerEvents="none">
            <line x1={p.x} y1={p.y} x2={p.labelX} y2={p.labelY+13} stroke={color} opacity=".35"/>
            <circle cx={p.x} cy={p.y} r="12" fill={color} opacity=".1"/>
            <circle cx={p.x} cy={p.y} r="4.5" fill={color}/>
          </g>
          <g data-node-id={p.id} className={`map-node${selected?.id===p.id?' is-selected':''}`} role="button" tabIndex={0} aria-label={`${p.label}, ${p.sourceLabel}`} aria-pressed={selected?.id===p.id} onClick={()=>choose(p.id)} onKeyDown={e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(p.id);}
          if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();moveNode(p.id,['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);}
        }}>
          <title>{p.label} · {p.sourceLabel}</title>
          <rect x={p.labelX} y={p.labelY} width={p.width} height="26" rx="5"/>
          <text x={p.labelX+8} y={p.labelY+17}>{p.label.length>31?`${p.label.slice(0,30)}…`:p.label}</text>
        </g></g>;})}
      </svg>}
    </div>
    {selected&&<section className="map-detail" aria-label="Selected occurrence">
      <div className="map-title-row"><div><small>{selected.sourceLabel} · {selected.structuralLevel===null?'Unclassified':LEVELS[selected.structuralLevel]}</small><h3>{selected.label}</h3></div><button aria-label="Close node details" onClick={()=>change({selectedNodeId:null})}>×</button></div>
      <div className="map-detail-body"><blockquote>{selectedAnchor?.quote}</blockquote><div>
        <p>{selected.summary}</p>
        <button className="map-source-button" onClick={()=>{if(selectedAnchor){change({readerAnchorId:selectedAnchor.id});onSource(selectedAnchor);}}}>Read this passage ↗</button>
        <p>Shared concept: {identity?.label}</p>
        <div className="map-related">{identity?.occurrenceIds.filter(id=>id!==selected.id).map(id=><button key={id} onClick={()=>choose(id)}>{graph.nodes.find(n=>n.id===id)?.label} ↗</button>)}</div>
        <details><summary>Position & relation evidence</summary><p>{selected.evidence.rationale}</p><p>Rule: {selected.evidence.ruleVersion} · confidence: unassessed. Z: {selected.position.z?.toFixed(6)??'unknown'} of the source file.</p>{selected.anchorIds.slice(1).map(id=>{const a=graph.anchors.find(anchor=>anchor.id===id);return a?<button className="map-source-button" key={id} onClick={()=>{change({readerAnchorId:id});onSource(a);}}>Read additional evidence ↗</button>:null;})}{related.map(e=><p key={e.id}><button onClick={()=>choose(e.source===selected.id?e.target:e.source)}>{graph.nodes.find(n=>n.id===e.source)?.label} → {e.type} → {graph.nodes.find(n=>n.id===e.target)?.label}</button><br/>{e.rationale} · {e.provenance}{e.evidenceAnchorIds.map(id=>{const a=graph.anchors.find(anchor=>anchor.id===id);return a?<button className="map-source-button" key={id} onClick={()=>{change({readerAnchorId:id});onSource(a);}}>Relation evidence ↗</button>:null;})}</p>)}</details>
      </div></div>
    </section>}
    <footer className="map-footer">
      {graph.analysis&&<div className="map-filters"><label>Theme <select aria-label="Theme filter" value={current.themeFilter??''} onChange={e=>change({themeFilter:e.target.value||null,nodePage:0})}><option value="">All themes</option>{graph.territories.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Text <select aria-label="Text type filter" value={current.roleFilter??''} onChange={e=>change({roleFilter:(e.target.value||null) as MapView['roleFilter'],nodePage:0})}><option value="">All source text</option><option value="dialogue">Dialogue</option><option value="commentary">Commentary</option><option value="paratext">Front matter / apparatus</option></select></label></div>}
      {!list&&windowed.pages>1&&<div className="map-pagination"><button aria-label="Previous map page" disabled={windowed.page===0} onClick={()=>change({nodePage:windowed.page-1})}>← Previous</button><span>Showing {windowed.page*SPATIAL_PAGE_SIZE+1}–{Math.min((windowed.page+1)*SPATIAL_PAGE_SIZE,windowed.filtered.length)} of {windowed.filtered.length} · same coordinates</span><button aria-label="Next map page" disabled={windowed.page===windowed.pages-1} onClick={()=>change({nodePage:windowed.page+1})}>Next →</button></div>}
      <div className="map-footer-row"><label>Source range <select aria-label="Source range" value={current.sourceScope} onChange={e=>{cancelMotion();change({sourceScope:e.target.value as MapView['sourceScope'],nodePage:0});}}><option value="excerpt">Book I opening · expanded</option><option value="book">Entire source file</option></select></label><span>{graph.nodes.length} occurrences · {graph.territories.length} themes <button className="map-save-view" onClick={onSaveView}>Save view</button></span></div>
      <p aria-live="polite">{current.projection==='3d'?'3D space · Drag near a plane to snap':`${PROJECTIONS.find(p=>p.id===current.projection)?.hint} · Drag away to return to 3D`} · Shift-drag to pan</p>
      <p className="map-disclosure">{graph.analysis?`${graph.analysis.model} · ${graph.analysis.completedChunks}/${graph.analysis.totalChunks} text sections processed. Selective outline; model-reviewed, not human-verified.`:'Editorial sample, not whole-book analysis.'} Height means structure, not importance. Dashed links are model/editorial interpretations. {unknown.length>0&&<> {unknown.length} unplaced nodes in Browse nodes.</>}</p>
    </footer>
  </div>;
}
