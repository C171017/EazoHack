'use client';
import { useEffect, useRef, useState } from 'react';
import { ZOOM_POLICY, type MapEntry } from '../../shared/zoom-hierarchy';
export type AnimatedEntry={node:MapEntry;position:MapEntry['position'];opacity:number;radius:number;exiting:boolean};
const radius=(node:MapEntry)=>node.kind==='cluster'?15:5;
export function transitionPlan(previous:AnimatedEntry[],next:MapEntry[],index:ReadonlyMap<string,MapEntry>) {
  const before=new Map(previous.map(n=>[n.node.id,n])),after=new Map(next.map(n=>[n.id,n]));
  const ancestor=(node:MapEntry,ids:ReadonlyMap<string,unknown>)=>{
    let p=node.parentId;while(p){if(ids.has(p))return p;p=index.get(p)?.parentId??null;}return null;
  };
  const entries=next.map(node=>{
    const existing=before.get(node.id),parent=ancestor(node,before),from=existing??(parent?before.get(parent):undefined);
    return {from:existing??{node,position:from?.position??node.position,opacity:0,radius:from?.radius??radius(node),exiting:false},to:{node,position:node.position,opacity:1,radius:radius(node),exiting:false}};
  });
  for(const from of previous) {
    if(after.has(from.node.id)||entries.length>=ZOOM_POLICY.transitions)continue;
    const parent=ancestor(from.node,after),to=parent?after.get(parent):undefined;
    entries.push({from,to:{node:from.node,position:to?.position??from.position,opacity:0,radius:to?radius(to):from.radius,exiting:true}});
  }
  return entries;
}
export function useNodeTransition(nodes:MapEntry[],index:ReadonlyMap<string,MapEntry>) {
  const [animated,setAnimated]=useState<AnimatedEntry[]>(()=>nodes.map(node=>({node,position:node.position,opacity:1,radius:radius(node),exiting:false})));
  const latest=useRef(animated),signature=nodes.map(n=>n.id).join('|');
  const target=useRef({nodes,index});
  // Camera changes should reproject immediately, never restart a membership tween.
  useEffect(()=>{target.current={nodes,index};},[nodes,index]);
  useEffect(()=>{
    const {nodes,index}=target.current;
    const plan=transitionPlan(latest.current,nodes,index);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame:number,start:number|undefined;
    const tick=(now:number)=>{
      start??=now;const t=reduced?1:Math.min(1,(now-start)/ZOOM_POLICY.duration),ease=t*t*(3-2*t);
      const next=plan.filter(p=>t<1||!p.to.exiting).map(({from,to})=>({
        ...to,position:from.position&&to.position?{x:from.position.x+(to.position.x-from.position.x)*ease,y:from.position.y+(to.position.y-from.position.y)*ease,z:from.position.z+(to.position.z-from.position.z)*ease}:to.position,
        opacity:from.opacity+(to.opacity-from.opacity)*ease,radius:from.radius+(to.radius-from.radius)*ease,
      }));
      latest.current=next;setAnimated(next);if(t<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[signature]);
  return animated;
}
