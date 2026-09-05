'use client';
import { Background, PanOnScrollMode, ReactFlow, type Viewport } from '@xyflow/react';
const nodes = [
  { id:'selection',position:{x:210,y:25},data:{label:'Selected passage'},style:{borderColor:'var(--color-moss)',background:'var(--color-mist)'} },
  { id:'interactive',position:{x:30,y:140},data:{label:'Interactive UI'} },
  { id:'diagram',position:{x:390,y:140},data:{label:'Concept diagram'} },
  { id:'image',position:{x:30,y:270},data:{label:'Generated image'} },
  { id:'reference',position:{x:390,y:270},data:{label:'Sources & references'} },
];
const edges = ['interactive','diagram','image','reference'].map(id=>({id:`selection-${id}`,source:'selection',target:id}));
export function BookMap({onViewportChange, viewport}: {onViewportChange:(viewport:Viewport)=>void; viewport:Viewport|null}) {
  return <div className="book-map relative h-full min-h-64 w-full">
    <ReactFlow nodes={nodes} edges={edges} fitView={!viewport} defaultViewport={viewport ?? undefined} onMoveEnd={(_,v)=>onViewportChange(v)} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.3} maxZoom={1.5} zoomOnScroll={false} zoomOnPinch panOnScroll panOnScrollMode={PanOnScrollMode.Free}>
      <Background color="#252a26" gap={22} size={1}/>
    </ReactFlow>
    <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border border-line bg-paper/95 px-3 py-2 text-[10px] text-muted">Fixture topology · no book analysis</div>
  </div>;
}
