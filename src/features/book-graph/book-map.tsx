'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Graph, MapView, SourceAnchor } from '@/shared/schemas';
import { initialView, LEVELS, orientation, placeLabels, PROJECTIONS, project, worldPoint, type Point3 } from './projection';

const COLORS = ['#caaf7c','#84b7ad','#a398cb'];
const AXES = [{key:'x',label:'X · Themes',color:'#caaf7c'},{key:'y',label:'Y · Structure',color:'#84b7ad'},{key:'z',label:'Z · Source order',color:'#a398cb'}] as const;
export function BookMap({graph,excerptRange,view,onViewChange,onSource,onSaveView}: {
  graph:Graph; excerptRange:[number,number]; view:MapView|null;
  onViewChange:(view:MapView)=>void; onSource:(anchor:SourceAnchor)=>void; onSaveView:()=>void;
}) {
  const current = view?.graphVersion === graph.graphVersion ? view : initialView(graph.graphVersion);
  const [size,setSize] = useState({width:800,height:550});
  const spatialAvailable=graph.nodes.length<=80;
  const [list,setList] = useState(!spatialAvailable);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const frame = useRef<number|null>(null);
  const drag = useRef<{id:number;x:number;y:number;view:MapView;pan:boolean}|null>(null);
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
  function switchProjection(projection:MapView['projection']) {
    cancelMotion();
    const target={...current,projection,...orientation(projection),x:0,y:0};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onViewChange(target);return;}
    let start:number|undefined;
    const animate=(now:number)=>{
      start ??= now;
      const t=Math.min(1,(now-start)/320),ease=t*t*(3-2*t);
      onViewChange({...target,yaw:current.yaw+(target.yaw-current.yaw)*ease,pitch:current.pitch+(target.pitch-current.pitch)*ease});
      if(t<1)frame.current=requestAnimationFrame(animate);else frame.current=null;
    };
    frame.current=requestAnimationFrame(animate);
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
  const points=graph.nodes.flatMap(node=>{
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
    cancelMotion();change({selectedNodeId:id});
    if(focus)svg.current?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus();
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
    <header className="map-header">
      <div className="map-eyebrow"><span>THE REPUBLIC</span><span>EDITORIAL SAMPLE · BOOK I</span></div>
      <div className="map-title-row"><h2>A space for ideas.</h2><button className="map-small-button" aria-pressed={list} disabled={!spatialAvailable} onClick={()=>setList(!list)}>{list?'Show space':'Browse nodes'}</button></div>
      <p className="map-subtitle">Themes, structure, and the path through a book.</p>
      <div className="map-projections" role="group" aria-label="Map projection">
        {PROJECTIONS.map((p,i)=><button key={p.id} aria-pressed={current.projection===p.id} title={`${p.hint} · keyboard ${i+1}`} onClick={()=>switchProjection(p.id)}><span>{p.label}</span><small>{p.hint}</small></button>)}
      </div>
    </header>
    <div ref={stage} className="map-stage">
      {list?<div className="map-node-list" aria-label="All map occurrences">{graph.nodes.map(n=><button key={n.id} aria-pressed={selected?.id===n.id} onClick={()=>choose(n.id)}><span>{n.label}</span><small>{n.sourceLabel} · {n.structuralLevel===null?'Unclassified':LEVELS[n.structuralLevel]}</small></button>)}</div>:
      <svg ref={svg} width="100%" height="100%" aria-label="Book map: orbitable 3D coordinates with three projections" role="group" tabIndex={0}
        onKeyDown={e=>{
          if(e.target!==e.currentTarget)return;
          if(e.key.startsWith('Arrow')){e.preventDefault();cancelMotion();change({projection:'3d',yaw:current.yaw+(e.key==='ArrowRight'?.12:e.key==='ArrowLeft'?-.12:0),pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,current.pitch+(e.key==='ArrowUp'?.12:e.key==='ArrowDown'?-.12:0)))});}
        }}
        onPointerDown={e=>{
          if((e.target as Element).closest('[data-node-id]')||e.button!==0)return;
          cancelMotion();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:current,pan:e.shiftKey||current.projection!=='3d'};e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          const d=drag.current;if(!d||d.id!==e.pointerId)return;
          const dx=e.clientX-d.x,dy=e.clientY-d.y;
          onViewChange(d.pan?{...d.view,x:d.view.x+dx,y:d.view.y+dy}:{...d.view,projection:'3d',yaw:d.view.yaw+dx*.006,pitch:Math.max(-Math.PI/2,Math.min(Math.PI/2,d.view.pitch+dy*.006))});
        }}
        onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        <desc>X is thematic territory. Y rises from detail to organizing structure, not importance. Z is source order, not historical time. Drag to orbit in 3D; Shift-drag to pan. Arrow keys orbit, node arrows follow relations, keys 1 to 4 switch views.</desc>
        <g className="map-grid" aria-hidden="true">{grid.map((l,i)=>{const a=screen(l.a),b=screen(l.b);return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}</g>
        <g aria-hidden="true">{AXES.map((axis,i)=>{
          if(current.projection==='xy'&&i===2||current.projection==='xz'&&i===1||current.projection==='yz'&&i===0)return null;
          const a=screen(origin),b=screen(ends[i]);
          return <g key={axis.key}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis.color} strokeWidth="1.5"/><text x={b.x+8} y={b.y-12} fill={axis.color} className="map-axis-title">{axis.label}</text></g>;
        })}</g>
        <g className="map-axis-ticks" aria-hidden="true">
          {current.projection!=='yz'&&graph.territories.map((t,i)=>{const p=screen({...origin,x:(t.centroidX-.5)*500});return <text key={t.id} x={p.x} y={p.y+26} textAnchor="middle" fill={COLORS[i%3]}>{t.label}</text>;})}
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
          <text x={p.labelX+8} y={p.labelY+17}>{p.label}</text>
        </g></g>;})}
      </svg>}
      <div className="map-camera-tools"><button aria-label="Zoom out" onClick={()=>{cancelMotion();change({zoom:Math.max(.5,current.zoom-.2)});}}>−</button><span>{Math.round(current.zoom*100)}%</span><button aria-label="Zoom in" onClick={()=>{cancelMotion();change({zoom:Math.min(2.5,current.zoom+.2)});}}>+</button><button onClick={()=>{cancelMotion();onViewChange({...current,...orientation(current.projection),x:0,y:0,zoom:1});}}>Reset view</button></div>
    </div>
    {selected&&<section className="map-detail" aria-label="Selected occurrence">
      <div className="map-title-row"><div><small>{selected.sourceLabel} · {selected.structuralLevel===null?'Unclassified':LEVELS[selected.structuralLevel]}</small><h3>{selected.label}</h3></div><button aria-label="Close node details" onClick={()=>change({selectedNodeId:null})}>×</button></div>
      <div className="map-detail-body"><blockquote>{selectedAnchor?.quote}</blockquote><div>
        <button className="map-source-button" onClick={()=>{if(selectedAnchor){change({readerAnchorId:selectedAnchor.id});onSource(selectedAnchor);}}}>Read this passage ↗</button>
        <p>Shared concept: {identity?.label}</p>
        <div className="map-related">{identity?.occurrenceIds.filter(id=>id!==selected.id).map(id=><button key={id} onClick={()=>choose(id)}>{graph.nodes.find(n=>n.id===id)?.label} ↗</button>)}</div>
        <details><summary>Position & relation evidence</summary><p>{selected.evidence.rationale}</p><p>Rule: {selected.evidence.ruleVersion} · confidence: unassessed. Z: {selected.position.z?.toFixed(6)??'unknown'} of the source file.</p>{related.map(e=><p key={e.id}><button onClick={()=>choose(e.source===selected.id?e.target:e.source)}>{graph.nodes.find(n=>n.id===e.source)?.label} → {e.type} → {graph.nodes.find(n=>n.id===e.target)?.label}</button><br/>{e.rationale}</p>)}</details>
      </div></div>
    </section>}
    <footer className="map-footer">
      <div className="map-footer-row"><label>Source range <select aria-label="Source range" value={current.sourceScope} onChange={e=>{cancelMotion();change({sourceScope:e.target.value as MapView['sourceScope']});}}><option value="excerpt">Book I opening · expanded</option><option value="book">Entire source file</option></select></label><span>{graph.nodes.length} occurrences · {graph.territories.length} themes <button className="map-save-view" onClick={onSaveView}>Save view</button></span></div>
      <p>{current.projection==='3d'?'Drag to orbit · Shift-drag to pan':'Drag to pan · 1–4 to switch views'} · Node arrows follow relations</p>
      <p className="map-disclosure">Editorial sample, not whole-book analysis. Height means structure, not importance. Dashed links are interpretations. {!spatialAvailable&&<>Spatial view supports up to 80 occurrences; all nodes are available in this list.</>}{unknown.length>0&&<> {unknown.length} unplaced nodes in Browse nodes.</>}</p>
    </footer>
  </div>;
}
