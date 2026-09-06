'use client';
import {useEffect,useRef} from 'react';
import {TimelineScroll,timelineWheelDelta} from './timeline-scroll';

export function TimelineControl({x,y,progress,height,onScroll,visible}:{x:number;y:number;visible:boolean;progress:number;height:number;onScroll:(delta:number)=>void}) {
  const target=useRef<HTMLDivElement>(null);
  const flowOffset=useRef(0);
  useEffect(()=>{
    const element=target.current;if(!element)return;
    if(!visible){element.blur();return;}
    const motion=new TimelineScroll();let frame:number|null=null,lastFrame=0;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;motion.reset();element.removeAttribute('data-scrolling');};
    const advance=(delta:number)=>{
      if(!delta)return;
      element.setAttribute('data-scroll-direction',delta<0?'up':'down');
      if(!reduced.matches){
        // One chevron spacing per two-thirds of a reader viewport. Use the
        // same eased distance as the book, so speed and settling stay linked.
        flowOffset.current=((flowOffset.current+delta/Math.max(1,height)*43.5)%29+29)%29;
        element.style.setProperty('--scroll-phase',`${flowOffset.current}px`);
      }
      onScroll(delta);
    };
    const animate=(now:number)=>{
      advance(motion.step(now-lastFrame));lastFrame=now;
      if(motion.pending)frame=requestAnimationFrame(animate);else{frame=null;element.removeAttribute('data-scrolling');}
    };
    const wheel=(event:WheelEvent)=>{
      // The target owns only plain, vertical wheel input. Pinch and horizontal
      // gestures cannot accidentally advance the book.
      event.preventDefault();
      const delta=timelineWheelDelta(event,height);if(!delta){stop();return;}
      element.setAttribute('data-scroll-direction',delta<0?'up':'down');
      motion.push(delta,performance.now(),height);
      if(reduced.matches){advance(motion.pending);motion.pending=0;return;}
      element.setAttribute('data-scrolling','true');
      if(frame===null){lastFrame=performance.now();frame=requestAnimationFrame(animate);}
    };
    const key=(event:KeyboardEvent)=>{
      const delta=({ArrowDown:height*2,ArrowUp:-height*2,PageDown:height*8,PageUp:-height*8} as Record<string,number>)[event.key];
      if(delta===undefined)return;
      event.preventDefault();event.stopPropagation();stop();advance(delta);
    };
    element.addEventListener('wheel',wheel,{passive:false});
    element.addEventListener('keydown',key);
    element.addEventListener('pointerleave',stop);
    element.addEventListener('blur',stop);
    window.addEventListener('pointerdown',stop,true);
    window.addEventListener('blur',stop);
    return()=>{stop();element.removeEventListener('wheel',wheel);element.removeEventListener('keydown',key);element.removeEventListener('pointerleave',stop);element.removeEventListener('blur',stop);window.removeEventListener('pointerdown',stop,true);window.removeEventListener('blur',stop);};
  },[onScroll,height,visible]);
  const percent=Math.max(0,Math.min(100,progress*100));
  return <div ref={target} className="map-timeline-control" data-hidden={!visible} aria-hidden={!visible} inert={!visible} style={{left:x,top:y}} tabIndex={visible?0:-1} role="scrollbar" aria-label="Book timeline: scroll vertically" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(1))} aria-valuetext={`${percent.toFixed(1)}% through the book`} aria-controls="book-source-scroll" onPointerDown={event=>{event.preventDefault();event.currentTarget.focus();}}>
    <span className="map-timeline-current" aria-hidden="true"><span className="map-timeline-stream">{[0,1,2,3,4,5,6].map(index=><svg key={index} style={{top:index*29-37}} viewBox="0 0 24 24" fill="none"><path d="m5 9 7 7 7-7"/></svg>)}</span></span>
  </div>;
}
