'use client';
import { useEffect, useRef, useState } from 'react';
import { ZOOM_POLICY, type MapEntry } from '../../shared/zoom-hierarchy';
export type AnimatedEntry={node:MapEntry;position:MapEntry['position'];opacity:number;radius:number;exiting:boolean};
const radius=(node:MapEntry)=>node.kind==='cluster'?15:5;
export function transitionPlan(previous:AnimatedEntry[],next:MapEntry[]) {
  const before=new Map(previous.map(n=>[n.node.id,n])),after=new Map(next.map(n=>[n.id,n]));
  // Crossfade at immutable source positions. Children never fly out of a
  // parent, and disappearing leaves never collapse back into one.
  const entries=next.map(node=>{
    const existing=before.get(node.id);
    return {from:existing??{node,position:node.position,opacity:0,radius:radius(node),exiting:false},to:{node,position:node.position,opacity:1,radius:radius(node),exiting:false}};
  });
  for(const from of previous) {
    if(after.has(from.node.id)||entries.length>=ZOOM_POLICY.transitions)continue;
    entries.push({from,to:{...from,position:from.node.position,opacity:0,exiting:true}});
  }
  return entries;
}
export function useNodeTransition(nodes:MapEntry[]) {
  const [animated,setAnimated]=useState<AnimatedEntry[]>(()=>nodes.map(node=>({node,position:node.position,opacity:1,radius:radius(node),exiting:false})));
  const latest=useRef(animated),signature=nodes.map(n=>n.id).join('|');
  const target=useRef(nodes);
  // Camera changes should reproject immediately, never restart a membership tween.
  useEffect(()=>{target.current=nodes;},[nodes]);
  useEffect(()=>{
    const plan=transitionPlan(latest.current,target.current);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame:number,start:number|undefined;
    const tick=(now:number)=>{
      start??=now;const t=reduced?1:Math.min(1,(now-start)/ZOOM_POLICY.duration),ease=t*t*(3-2*t);
      const next=plan.filter(p=>t<1||!p.to.exiting).map(({from,to})=>({
        ...to,position:to.node.position,
        opacity:from.opacity+(to.opacity-from.opacity)*ease,radius:from.radius+(to.radius-from.radius)*ease,
      }));
      latest.current=next;setAnimated(next);if(t<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[signature]);
  return animated;
}
