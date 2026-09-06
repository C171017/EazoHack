'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapView, SourceAnchor } from '@/shared/schemas';
import { ZOOM_POLICY, type MapBootstrap, type MapEntry, type MapLink, type NodeDetail } from '@/shared/zoom-hierarchy';
import { initialView, confineCamera, LEVELS, beginOrbit, advanceOrbit, type OrbitMotion, approachingProjection, orbitFrom, springProgress, orientation, placeLabels, placeClusterHandles, PROJECTIONS, type Point3 } from './projection';
import { confinePan, fitEntries, screenWorld, mapObstacles } from './map-framing';
import { MapGrid, ORIGIN } from './map-grid';
import { TimelineControl } from './timeline-control';
import { axisValue, axisRange, coordinateRating } from '../../shared/book-axes';
import { AxisDetails } from './axis-details';
import { UnplacedNotes } from './unplaced-notes';
import { semanticWindow, toScreen, zoomCentered, zoomIntoGroup, zoomLevel } from './semantic-window';
import { readMap, useMapPages, useMapRequest } from './map-data';
import { useNodeTransition } from './node-transition';
import { edgeVisibility, useEdgeTransition } from './edge-transition';
import { HeatInspector, type ReadingHeatData } from './reading-heat-view';
import { heatCount } from './reading-heat';
import { buildHeatVolume } from './heat-field';
import { SpatialHeat } from './spatial-heat';
const COLORS=['#caaf7c','#84b7ad','#a398cb','#8baecc','#ba9a9c','#99b687','#b5ac83'];
export function BookMap({graph,view,onViewChange:saveView,onSource,readingProgress,onScrollSource,heat}:{
  graph:MapBootstrap;view:MapView|null;readingProgress:number;onScrollSource:(delta:number)=>void;
  heat?:ReadingHeatData;
  onViewChange:(view:MapView)=>void;onSource:(anchor:SourceAnchor)=>void;
}) {
  const [size,setSize]=useState({width:0,height:0});
  const onViewChange=useCallback((next:MapView)=>saveView(confinePan(next,size)),[saveView,size]);
  const [heatSelection,setHeatSelection]=useState<string|null>(null);
  const heatPoints=heat?.points;
  const heatField=useMemo(()=>heatPoints?buildHeatVolume(heatPoints,'all'):null,[heatPoints]);
  const heatTargets=useMemo(()=>[...(heatPoints??[])].filter(point=>heatCount(point,'all')>0).sort((a,b)=>heatCount(b,'all')-heatCount(a,'all')).slice(0,128),[heatPoints]);
  const selectedHeat=heat?.points.find(point=>point.leaf.id===heatSelection);
  // Old checkpoints may contain filters whose controls have been removed.
  // Keep their camera and selection, but always display the whole source.
  const saved=useMemo<MapView>(()=>{
    if(view?.graphVersion!==graph.graphVersion||(view.hierarchyVersion&&view.hierarchyVersion!==graph.version))return {...initialView(graph.graphVersion),hierarchyVersion:graph.version,sourceScope:'book' as const};
    const migrated=view.axisConvention==='z-up-v1'?view:{...view,...orientation(view.projection),axisConvention:'z-up-v1' as const};
    return {...migrated,...confineCamera(migrated),themeFilter:null,roleFilter:null,sourceScope:'book',zoom:Math.max(ZOOM_POLICY.minZoom,Math.min(ZOOM_POLICY.maxZoom,migrated.zoom)),...(migrated.zoom<ZOOM_POLICY.minZoom?{x:0,y:0}:{}),hierarchyVersion:graph.version,selectedNodeId:!migrated.hierarchyVersion&&migrated.selectedNodeId?.startsWith('h-')?null:migrated.selectedNodeId};
  },[view,graph.graphVersion,graph.version]);
  const current=useMemo(()=>confinePan(saved.framing?saved:fitEntries(graph.roots,saved,size,readingProgress),size),[saved,graph.roots,size,readingProgress]);
  useEffect(()=>{if(!saved.framing&&size.width>0&&size.height>0)onViewChange(current);},[saved.framing,current,size,onViewChange]);
  const [previousLevel,setPreviousLevel]=useState(0),[navigationError,setNavigationError]=useState<string|null>(null);
  const [navigating,setNavigating]=useState(false);
  const level=zoomLevel(current.zoom,previousLevel,graph.depth);
  const range:[number,number]=[0,1];
  const data=useMapPages(graph.version,pages=>semanticWindow(graph.roots,pages,current,size,range,level,readingProgress));
  const {windowed,install}=data;
  const index=useMemo(()=>new Map([...graph.roots,...[...data.pages.values()].flat()].map(n=>[n.id,n])),[graph.roots,data.pages]);
  const animated=useNodeTransition(windowed.nodes);
  const restoredPath=useMapRequest<{node:MapEntry;pages:Record<string,MapEntry[]>}>(graph.version,current.selectedNodeId&&!index.has(current.selectedNodeId)?{kind:'locate',id:current.selectedNodeId}:null);
  useEffect(()=>{if(restoredPath.data)install(restoredPath.data.pages);},[restoredPath.data,install]);
  const selectedEntry=index.get(current.selectedNodeId??'')??restoredPath.data?.node;
  const selectedAncestors=new Set<string>();let ancestor=selectedEntry?.parentId;while(ancestor){selectedAncestors.add(ancestor);ancestor=index.get(ancestor)?.parentId;}
  const detail=useMapRequest<{detail:NodeDetail}>(graph.version,current.selectedNodeId&&selectedEntry?.kind==='occurrence'?{kind:'detail',id:current.selectedNodeId}:null);
  const selected=detail.data?.detail;
  const [sourceActivation,setSourceActivation]=useState<{id:string;ticket:number}|null>(null);
  const sourceTicket=useRef(0),consumedSource=useRef(0);
  // Only an explicit activation jumps: restore, camera changes and detail refetch do not.
  useEffect(()=>{
    if(!sourceActivation||consumedSource.current===sourceActivation.ticket
      ||current.selectedNodeId!==sourceActivation.id||selected?.node.id!==sourceActivation.id)return;
    const anchor=selected.anchors.find(a=>a.id===selected.node.anchorIds[0]);
    if(!anchor)return;
    consumedSource.current=sourceActivation.ticket;
    // A source jump changes the note's height to the reading plane. Frame that
    // destination, rather than retaining the old (possibly offscreen) height.
    const position=selectedEntry?.position;
    const target=position?toScreen(position,current,size,[0,1],position.z):null;
    onViewChange({...current,readerAnchorId:anchor.id,...(target?{x:current.x+size.width/2-target.x,y:current.y+size.height/2-target.y}:{})});
    onSource(anchor);
  },[sourceActivation,selected,selectedEntry,current,size,onViewChange,onSource]);
  const edges=useMapRequest<{links:MapLink[];total:number}>(graph.version,{kind:'edges',id:windowed.nodes.map(n=>n.id).sort(),start:'0',end:'1'},140);
  const animatedEdges=useEdgeTransition(edges.data?.links);
  const stage=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),frame=useRef<number|null>(null);
  const latest=useRef({current,size}),navigation=useRef<AbortController|null>(null);
  const drag=useRef<{id:number;mode:'pan'|'orbit';x:number;y:number;view:MapView;latest:MapView;motion:OrbitMotion;lastX:number;lastY:number;moved:boolean}|null>(null);
  const keyboardOrbit=useRef<MapView|null>(null);
  useEffect(()=>{latest.current={current,size};},[current,size]);
  useEffect(()=>{const f=requestAnimationFrame(()=>setPreviousLevel(level));return()=>cancelAnimationFrame(f);},[level]);
  useEffect(()=>{
    const element=stage.current;if(!element)return;
    const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({width,height});});observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);navigation.current?.abort();},[]);
  // Native non-passive listener is required for trackpad pinch (ctrl+wheel).
  useEffect(()=>{
    const element=stage.current;if(!element)return;
    let gesture:{view:MapView;size:typeof size}|null=null;
    const wheel=(event:WheelEvent)=>{
      if(!(event.target instanceof Element)||!event.target.closest('svg,.map-timeline-control'))return;
      event.preventDefault();if(gesture)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?latest.current.size.height:1;
      const pinch=event.ctrlKey||event.metaKey;
      if(!pinch&&event.target.closest('.map-timeline-control'))return;
      if(frame.current!==null)cancelAnimationFrame(frame.current);
      navigation.current?.abort();setNavigating(false);
      const {current:view,size}=latest.current;
      const next=pinch
        ?zoomCentered(view,view.zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY*unit))*.012),size,graph.roots,readingProgress)
        :{...view,x:view.x-(event.shiftKey&&!event.deltaX?event.deltaY:event.deltaX)*unit,y:view.y-(event.shiftKey&&!event.deltaX?0:event.deltaY)*unit};
      latest.current={current:confinePan(next,latest.current.size),size};onViewChange(next);
    };
    const gestureStart=(event:Event)=>{
      event.preventDefault();if(frame.current!==null)cancelAnimationFrame(frame.current);navigation.current?.abort();setNavigating(false);
      const {current:view,size}=latest.current;
      gesture={view,size};
    };
    const gestureChange=(event:Event)=>{event.preventDefault();if(!gesture)return;const scale=(event as Event&{scale:number}).scale;if(!Number.isFinite(scale)||scale<=0)return;const next=zoomCentered(gesture.view,gesture.view.zoom*scale,gesture.size,graph.roots,readingProgress);latest.current={current:confinePan(next,latest.current.size),size:gesture.size};onViewChange(next);};
    const gestureEnd=(event:Event)=>{event.preventDefault();gesture=null;};
    element.addEventListener('wheel',wheel,{passive:false});
    element.addEventListener('gesturestart',gestureStart,{passive:false});element.addEventListener('gesturechange',gestureChange,{passive:false});element.addEventListener('gestureend',gestureEnd,{passive:false});
    return()=>{element.removeEventListener('wheel',wheel);element.removeEventListener('gesturestart',gestureStart);element.removeEventListener('gesturechange',gestureChange);element.removeEventListener('gestureend',gestureEnd);};
  },[onViewChange,graph.roots,readingProgress]);
  const cancelMotion=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;};
  const change=(patch:Partial<MapView>)=>{if('selectedNodeId' in patch){setSourceActivation(null);if(patch.selectedNodeId)setHeatSelection(null);}cancelMotion();navigation.current?.abort();setNavigating(false);const next={...latest.current.current,...patch};latest.current={...latest.current,current:confinePan(next,latest.current.size)};onViewChange(next);};
  function activateLeaf(id:string) {
    change({selectedNodeId:id});
    setSourceActivation({id,ticket:++sourceTicket.current});
  }
  function settle(from:MapView,target:Pick<MapView,'projection'|'yaw'|'pitch'>) {
    cancelMotion();navigation.current?.abort();setNavigating(false);
    // Rotation must not turn a local subtree fit into the new zoom-out limit.
    const finish={...from,...target,...confineCamera(target)};
    const publish=(view:MapView)=>{latest.current={...latest.current,current:view};onViewChange(view);};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){publish(finish);return;}
    let start:number|undefined;const animate=(now:number)=>{
      start??=now;const elapsed=now-start,ease=springProgress(elapsed);
      publish(elapsed>=520?finish:{...from,projection:'3d',yaw:from.yaw+(finish.yaw-from.yaw)*ease,pitch:from.pitch+(finish.pitch-from.pitch)*ease,x:from.x+(finish.x-from.x)*ease,y:from.y+(finish.y-from.y)*ease,framing:from.framing&&finish.framing?{scale:from.framing.scale+(finish.framing.scale-from.framing.scale)*ease,center:{x:from.framing.center.x+(finish.framing.center.x-from.framing.center.x)*ease,y:from.framing.center.y+(finish.framing.center.y-from.framing.center.y)*ease,z:from.framing.center.z+(finish.framing.center.z-from.framing.center.z)*ease}}:finish.framing});
      if(elapsed<520)frame.current=requestAnimationFrame(animate);else frame.current=null;
    };frame.current=requestAnimationFrame(animate);
  }
  function finishDrag(){
    const d=drag.current;drag.current=null;if(!d||!d.moved||d.mode==='pan')return;
    const target=approachingProjection(d.motion.previous,d.motion.raw);
    // Align on entry; an intentional rotation within an already-flat view
    // should not be undone on release.
    if(target?.projection==='xy'&&d.view.projection==='xy'&&Math.abs(d.motion.raw.pitch-d.view.pitch)<1e-8)target.yaw=d.motion.raw.yaw;
    if(target)settle(d.latest,target);
  }
  function zoom(factor:number){const {current:view,size}=latest.current;change(zoomCentered(view,view.zoom*factor,size,graph.roots,readingProgress));}
  async function openCluster(node:MapEntry) {
    navigation.current?.abort();const controller=new AbortController();navigation.current=controller;
    cancelMotion();setNavigationError(null);setNavigating(true);
    try {
      const children=data.pages.get(node.id)??(await readMap<{pages:Record<string,MapEntry[]>}>(graph.version,{kind:'children',id:node.id},controller.signal)).pages[node.id];
      if(controller.signal.aborted)return;
      install({[node.id]:children});
      let depth=0,parent=node.parentId;while(parent){depth++;parent=index.get(parent)?.parentId??null;}
      const {current:from,size:viewport}=latest.current;
      const next=zoomIntoGroup(node,from,viewport,depth,readingProgress);
      setSourceActivation(null);setHeatSelection(null);
      const publish=(view:MapView)=>{latest.current={...latest.current,current:view};onViewChange(view);};
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){publish(next);return;}
      let start:number|undefined;
      const animate=(now:number)=>{
        if(controller.signal.aborted)return;
        start??=now;const t=Math.min(1,(now-start)/360),ease=t*t*(3-2*t);
        publish({...next,zoom:from.zoom+(next.zoom-from.zoom)*ease,x:from.x+(next.x-from.x)*ease,y:from.y+(next.y-from.y)*ease});
        if(t<1)frame.current=requestAnimationFrame(animate);else frame.current=null;
      };
      frame.current=requestAnimationFrame(animate);
    } catch(error){if(!controller.signal.aborted)setNavigationError(error instanceof Error?error.message:'Could not open this group');}
    finally{if(!controller.signal.aborted)setNavigating(false);}
  }
  async function locate(id:string) {
    setSourceActivation(null);
    navigation.current?.abort();const controller=new AbortController();navigation.current=controller;setNavigationError(null);setNavigating(true);cancelMotion();
    try {
      const result=await readMap<{node:MapEntry;ancestors:string[];pages:Record<string,MapEntry[]>}>(graph.version,{kind:'locate',id},controller.signal);
      if(controller.signal.aborted)return;
      data.install(result.pages);
      const zoom=Math.max(1,ZOOM_POLICY.step**result.ancestors.length*1.06),next={...latest.current.current,selectedNodeId:id,...(result.node.position?{zoom,x:0,y:0}:{})};
      if(result.node.position){const p=toScreen(result.node.position,next,size,[0,1],result.node.kind==='occurrence'?result.node.position.z:readingProgress);next.x=size.width/2-p.x;next.y=size.height/2-p.y;}
      latest.current={...latest.current,current:confinePan(next,latest.current.size)};onViewChange(next);
      if(result.node.kind==='occurrence')setSourceActivation({id,ticket:++sourceTicket.current});
    }catch(error){if(!controller.signal.aborted)setNavigationError(error instanceof Error?error.message:'Could not reveal node');}
    finally{if(!controller.signal.aborted)setNavigating(false);}
  }
  const screen=(p:Point3)=>screenWorld(p,current,size);
  const obstacles=[...mapObstacles(current,size,0),...(heatSelection!==null?[{x:16,y:size.height-494,width:size.width-32,height:430}]:[])];
  const projectedPoints=animated.flatMap(item=>{
    if(!item.position)return [];
    const p=toScreen(item.position,current,size,range,readingProgress);
    // Clamping a marker to the viewport would pin it in place while reading
    // and give it a false source height. Let all markers leave the viewport.
    if(p.x<0||p.y<0||p.x>size.width||p.y>size.height)return [];
    return [{...item,id:item.node.id,label:item.node.label,x:p.x,y:p.y,cluster:item.node.kind==='cluster'}];
  });
  const points=placeClusterHandles(projectedPoints,size.width,size.height,obstacles);
  const labelCap=Math.max(1,Math.min(ZOOM_POLICY.labels,Math.floor((size.width-16)/218)*Math.floor((size.height-80)/34)));
  const labelPoints=[...points].filter(p=>!p.exiting).sort((a,b)=>Number(b.id===current.selectedNodeId)-Number(a.id===current.selectedNodeId)||Number(b.node.kind==='cluster')-Number(a.node.kind==='cluster')).slice(0,labelCap);
  const labels=new Map(placeLabels(labelPoints,size.width,size.height,obstacles,points.map(p=>({...p,radius:p.radius*1.1}))).map(p=>[p.id,p]));
  const source=(anchor:SourceAnchor)=>{change({readerAnchorId:anchor.id});onSource(anchor);};
  return <div className="book-map" onKeyDown={e=>{
    if((e.target as HTMLElement).closest('input,select,textarea'))return;
    const i=['1','2','3','4'].indexOf(e.key);if(i>=0){e.preventDefault();const projection=PROJECTIONS[i].id;settle(current,{projection,...orientation(projection)});}
    if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.35);}if(e.key==='-'){e.preventDefault();zoom(1/1.35);}
  }}>
    <div ref={stage} className="map-stage">
      {graph.unplaced>0&&<UnplacedNotes version={graph.version} count={graph.unplaced} onLocate={id=>void locate(id)}/>}
      {heatField&&<SpatialHeat field={heatField} view={current} size={size} readingProgress={readingProgress}/>}
      <svg style={{position:'relative'}} data-reading-progress={readingProgress} data-axis-version={graph.axisVersion??'legacy'} ref={svg} width="100%" height="100%" role="group" tabIndex={0} aria-label="Book map: pinch to explore layers" data-camera-x={current.x} data-camera-y={current.y} data-camera-yaw={current.yaw} data-camera-pitch={current.pitch} data-camera-zoom={current.zoom} data-fit-scale={current.framing?.scale??1} data-projection={current.projection} data-level={level} data-visible-count={windowed.nodes.length} data-cache-pages={data.pages.size} data-rendered-count={points.length}
        onKeyDown={e=>{if(e.target===e.currentTarget&&e.key.startsWith('Arrow')){e.preventDefault();const view=latest.current.current;if(view.projection!=='3d'&&!e.altKey){change({x:view.x+(e.key==='ArrowRight'?-40:e.key==='ArrowLeft'?40:0),y:view.y+(e.key==='ArrowDown'?-40:e.key==='ArrowUp'?40:0)});return;}keyboardOrbit.current??=view;change({...orbitFrom(view,e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0,e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0),projection:'3d'});}}}
        onKeyUp={e=>{if(e.target===e.currentTarget&&e.key.startsWith('Arrow')){const from=keyboardOrbit.current;keyboardOrbit.current=null;const view=latest.current.current,target=from&&approachingProjection(from,view);if(target?.projection==='xy'&&from?.projection==='xy'&&Math.abs(view.pitch-from.pitch)<1e-8)target.yaw=view.yaw;if(target)settle(view,target);}}}
        onBlur={()=>{keyboardOrbit.current=null;}}
        onPointerDown={e=>{
          if(drag.current||(e.target as Element).closest('[data-node-id]')||![0,1,2].includes(e.button))return;
          e.preventDefault();
          cancelMotion();keyboardOrbit.current=null;navigation.current?.abort();setNavigating(false);
          const view=latest.current.current;
          drag.current={id:e.pointerId,mode:e.button===1||e.button===2?'pan':'orbit',x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,view,latest:view,motion:beginOrbit(view),moved:false};
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          const d=drag.current;if(!d||d.id!==e.pointerId)return;
          const dx=e.clientX-d.x,dy=e.clientY-d.y;
          if(Math.hypot(dx,dy)<3&&!d.moved)return;
          d.moved=true;
          if(d.mode==='pan')d.latest=confinePan({...d.latest,x:d.latest.x+e.clientX-d.lastX,y:d.latest.y+e.clientY-d.lastY},latest.current.size);
          else {
            // Integrate incremental deltas so reversal at a pole responds immediately.
            d.motion=advanceOrbit(d.motion,e.clientX-d.lastX,e.clientY-d.lastY);
            d.latest={...d.view,projection:'3d',...d.motion.display};
          }
          d.lastX=e.clientX;d.lastY=e.clientY;
          latest.current={...latest.current,current:d.latest};onViewChange(d.latest);
        }}
        onContextMenu={e=>e.preventDefault()}
        onPointerUp={e=>{if(drag.current?.id!==e.pointerId)return;finishDrag();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
        <desc>Scroll over the Z origin control to skim the book. Scroll the text pane for normal reading. Earlier passages are higher; the horizontal plane marks your reading position. Pinch to zoom through the saved hierarchy. Activate a group to zoom into it; zoom out to return to broader groups. Drag to rotate in every projection. Two-finger scroll pans and pinch zooms. Right or middle drag pans. Alt-arrow keys orbit. Arrow keys pan flat views. Plus and minus zoom. Keys 1 to 4 switch projections. Larger circles summarize multiple notes. {graph.axisVersion?'Z is source progress; X increases with reasoning depth and Y with generality. These are interpretive ratings, not importance or truth.':'Legacy coordinates: X is topic and Y is structure.'}</desc>
        <defs><marker id="map-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#ADB5C0"/></marker></defs>
        <MapGrid size={size} projection={current.projection} screen={screen} axisVersion={graph.axisVersion} readingProgress={readingProgress}/>
        {heat&&<g data-heat-targets>{heatTargets.map(point=>{
          const p=toScreen(point.leaf.position,current,size,[0,1],readingProgress);
          if(p.x<0||p.y<0||p.x>size.width||p.y>size.height)return null;
          const open=()=>{change({selectedNodeId:null});setHeatSelection(point.leaf.id);};
          return <circle key={point.leaf.id} data-heat-leaf={point.leaf.id} cx={p.x} cy={p.y} r="16" fill="transparent" role="button" tabIndex={0}
            aria-label={`${point.leaf.label}: ${heatCount(point,'all')} reading footprints`} style={{cursor:'pointer'}}
            onPointerDown={e=>e.stopPropagation()} onClick={open} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();open();}}}>
            <title>{point.leaf.label} · {heatCount(point,'all')} generations</title>
          </circle>;
        })}</g>}
        <g aria-hidden="true" pointerEvents="none">{animatedEdges.map(({link:edge,opacity})=>{const a=points.find(p=>p.id===edge.source),b=points.find(p=>p.id===edge.target);return a&&b?<g key={edge.id} opacity={edgeVisibility(opacity,a,b)}><line data-edge-id={edge.id} data-edge-source={edge.source} data-edge-target={edge.target} x1={a.anchorX} y1={a.anchorY} x2={b.anchorX} y2={b.anchorY} className="map-edge" markerEnd="url(#map-arrow)"><title>{edge.type} · {edge.count} source relations</title></line></g>:null;})}</g>
        {points.map(p=>{const color=COLORS[Math.max(0,graph.territories.findIndex(t=>t.id===p.node.themeIds[0]))%COLORS.length],label=labels.get(p.id),cluster=p.node.kind==='cluster';let depth=0,parent=p.node.parentId;while(parent){depth++;parent=index.get(parent)?.parentId??null;}const radius=p.radius*Math.max(.75,Math.min(1.1,Math.sqrt(current.zoom/ZOOM_POLICY.step**depth)));return <g key={p.id} opacity={p.opacity} pointerEvents={p.exiting?'none':undefined} aria-hidden={p.exiting||undefined}>
          {Math.hypot(p.x-p.anchorX,p.y-p.anchorY)>1&&<g data-semantic-anchor={p.id} aria-hidden="true" pointerEvents="none"><circle cx={p.anchorX} cy={p.anchorY} r="2.5" fill={color}/><line x1={p.anchorX} y1={p.anchorY} x2={p.x} y2={p.y} stroke={color} opacity=".5"/></g>}
          {label&&<line x1={p.x} y1={p.y} x2={Math.max(label.labelX,Math.min(label.labelX+label.width,p.x))} y2={Math.max(label.labelY,Math.min(label.labelY+26,p.y))} stroke={color} opacity=".25"/>}
          <g data-node-id={p.id} data-node-kind={p.node.kind} className={`map-node${current.selectedNodeId===p.id||selectedAncestors.has(p.id)?' is-selected':''}`} role="button" tabIndex={p.exiting?-1:0} aria-label={`${p.label}${cluster?`, group of ${p.node.leafCount} notes. Activate to zoom in`:`, ${p.node.sourceLabel}`}`} aria-pressed={current.selectedNodeId===p.id||selectedAncestors.has(p.id)} onClick={()=>cluster?openCluster(p.node):activateLeaf(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(cluster)void openCluster(p.node);else activateLeaf(p.id);}if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const direction=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;const target=windowed.nodes[(windowed.nodes.findIndex(n=>n.id===p.id)+direction+windowed.nodes.length)%windowed.nodes.length];if(target)svg.current?.querySelector<SVGGElement>(`[data-node-id="${target.id}"]`)?.focus();}}}>
            <title>{p.label} · {cluster?`${p.node.leafCount} notes · ${p.node.summary}`:p.node.sourceLabel}</title>
            <circle cx={p.x} cy={p.y} r={radius+9} fill={color} opacity=".08"/>
            <circle cx={p.x} cy={p.y} r={radius} fill={cluster?'#252C35':color} stroke={color} strokeWidth="1.2"/>
            {cluster&&<text x={p.x} y={p.y+3} textAnchor="middle" className="map-cluster-count">{p.node.leafCount}</text>}
            {label&&<><rect x={label.labelX} y={label.labelY} width={label.width} height="26" rx="5"/><text x={label.labelX+8} y={label.labelY+17}>{p.label.length>31?`${p.label.slice(0,30)}…`:p.label}</text></>}
          </g>
        </g>;})}
      </svg>
      <TimelineControl {...screen(ORIGIN)} visible={current.pitch < Math.PI / 2 - .12} progress={readingProgress} height={size.height} onScroll={onScrollSource}/>
      {(data.error||windowed.wanted.length>0)&&<div className="map-layer-status" aria-live="polite">{data.error?<><span>{data.error}</span> <button onClick={data.retry}>Retry loading</button></>:windowed.wanted.length?'Opening this part of the book…':null}</div>}
    </div>
    {restoredPath.error&&<p role="alert">{restoredPath.error} <button onClick={restoredPath.retry}>Retry</button></p>}{navigationError&&<p role="alert">{navigationError}</p>}{navigating&&<p role="status">Finding this note…</p>}
    {heat&&selectedHeat&&!current.selectedNodeId&&<HeatInspector key={selectedHeat.leaf.id} point={selectedHeat} filter="all" onClose={()=>setHeatSelection(null)} onSource={source} onLocate={id=>{setHeatSelection(null);void locate(id);}}/>}
    {current.selectedNodeId&&<section className="map-detail" aria-label={selectedEntry?.kind==='cluster'?'Selected group':'Selected occurrence'}>
      <div className="map-title-row"><div><small>{selectedEntry?.kind==='cluster'?`${selectedEntry.leafCount} notes · generated summary`:selected?.node.sourceLabel??'Source occurrence'}</small><h3>{selectedEntry?.label??selected?.node.label??'Loading note…'}</h3></div><button aria-label="Close node details" onClick={()=>change({selectedNodeId:null})}>×</button></div>
      {selectedEntry?.kind==='cluster'?<><p>{selectedEntry.summary}</p><button className="map-source-button" onClick={()=>void openCluster(selectedEntry)}>Explore this group ↗</button><small> Grouping summarizes its children; it is not a new source passage.</small>{graph.axisVersion&&selectedEntry.bounds&&<p className="map-axis-range">Child range · Reasoning depth {axisRange(coordinateRating(selectedEntry.bounds.min.x,'x',graph.axisVersion),coordinateRating(selectedEntry.bounds.max.x,'x',graph.axisVersion),graph.axisVersion)} · Generality {axisRange(coordinateRating(selectedEntry.bounds.min.y,'y',graph.axisVersion),coordinateRating(selectedEntry.bounds.max.y,'y',graph.axisVersion),graph.axisVersion)}. The anchor represents a child position. Badges may shift slightly for readability; their connecting dots retain the exact position.</p>}</>:detail.error?<p role="alert">{detail.error} <button onClick={detail.retry}>Retry</button></p>:selected?<div className="map-detail-body"><div><blockquote>{selected.anchors.find(a=>a.id===selected.node.anchorIds[0])?.quote}</blockquote>{selected.node.axisAssessment?<p>X · Reasoning depth: {axisValue(selected.node.axisAssessment.reasoningDepth.value,graph.axisVersion)}<br/>Y · Generality: {axisValue(selected.node.axisAssessment.generality.value,graph.axisVersion)}</p>:<p>Legacy structure: {selected.node.structuralLevel===null?'Unclassified':LEVELS[selected.node.structuralLevel]}</p>}</div><div><p>{selected.node.summary}</p>{selected.node.anchorIds.map((id,i)=>{const a=selected.anchors.find(a=>a.id===id);return a?<button className="map-source-button" key={id} onClick={()=>source(a)}>{i?'Additional evidence':'Read this passage'} ↗ </button>:null;})}
        <p>Shared concept: {selected.identity.label}</p><div className="map-related">{selected.identity.occurrenceIds.filter(id=>id!==selected.node.id).map(id=><button key={id} onClick={()=>void locate(id)}>{selected.neighbours.find(n=>n.id===id)?.label} ↗</button>)}</div>
        <AxisDetails axisVersion={graph.axisVersion} detail={selected} onSource={source} onLocate={id=>void locate(id)}/><details><summary>Position & relation evidence</summary><p>{selected.node.evidence.rationale}</p>{selected.edges.map(e=><p key={e.id}><button onClick={()=>void locate(e.source===selected.node.id?e.target:e.source)}>{selected.neighbours.find(n=>n.id===e.source)?.label} → {e.type} → {selected.neighbours.find(n=>n.id===e.target)?.label}</button><br/>{e.rationale}{e.evidenceAnchorIds.map(id=>{const a=selected.anchors.find(a=>a.id===id);return a?<button className="map-source-button" key={id} onClick={()=>source(a)}>Relation evidence ↗ </button>:null;})}</p>)}</details></div></div>:<p>Loading source evidence…</p>}
    </section>}
  </div>;
}
