import type {MapView} from '../../shared/schemas';
import type {MapEntry} from '../../shared/zoom-hierarchy';
import {zoomCentered} from './semantic-window';
import type {Size} from './map-framing';

export type InputPoint = {pointerId:number;pointerType:string;button:number;clientX:number;clientY:number};
type Point = {x:number;y:number};
export type PointerMovement = {kind:'orbit'|'pan';dx:number;dy:number} | {kind:'pinch';dx:number;dy:number;scale:number};
const point=(event:InputPoint):Point=>({x:event.clientX,y:event.clientY});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);

export function pinchMovement(before:readonly [Point,Point],after:readonly [Point,Point]):PointerMovement {
  const span=distance(...before),nextSpan=distance(...after);
  return {kind:'pinch',dx:(after[0].x+after[1].x-before[0].x-before[1].x)/2,
    dy:(after[0].y+after[1].y-before[0].y-before[1].y)/2,
    // Coincident contact baselines have no meaningful scale; allow pan only.
    scale:span>=1&&nextSpan>=1?nextSpan/span:1};
}

export function pinchView(base:MapView,movement:Extract<PointerMovement,{kind:'pinch'}>,size:Size,roots:MapEntry[],readingProgress:number):MapView {
  const zoomed=movement.scale===1?base:zoomCentered(base,base.zoom*movement.scale,size,roots,readingProgress);
  return {...zoomed,x:zoomed.x+movement.dx,y:zoomed.y+movement.dy};
}

// Own the whole contact session, including spare fingers and 2 -> 1 handoff.
// Input geometry advances for every event; only rendering is frame-coalesced.
export class MapPointerInput {
  private points=new Map<number,{position:Point;origin:Point;type:string;mode:'pan'|'orbit'}>();
  private moved=false;
  private multiple=false;
  private blockedClick=false;
  get ids(){return [...this.points.keys()];}
  get active(){return this.points.size>0;}
  get touching(){return [...this.points.values()].some(p=>p.type==='touch');}
  get canSettle(){return this.moved&&!this.multiple&&this.points.size===1&&[...this.points.values()][0].mode==='orbit';}
  has(id:number){return this.points.has(id);}
  down(event:InputPoint,onNode=false){
    if(this.has(event.pointerId)||![0,1,2].includes(event.button))return false;
    // A new idle press ends the prior click-suppression window even when a
    // desktop node owns the press instead of starting a map drag.
    if(!this.active){this.moved=false;this.multiple=false;this.blockedClick=false;}
    if(event.pointerType!=='touch'&&(this.active||onNode))return false;
    if(event.pointerType==='touch'&&this.active&&!this.touching)return false;
    const position=point(event);
    this.points.set(event.pointerId,{position,origin:position,type:event.pointerType,mode:event.button===1||event.button===2?'pan':'orbit'});
    for(const p of this.points.values())p.origin=p.position;
    if(this.points.size>1){this.multiple=true;this.blockedClick=true;}
    return true;
  }
  move(event:InputPoint):PointerMovement|null {
    const entry=this.points.get(event.pointerId);if(!entry)return null;
    const next=point(event);if(!Number.isFinite(next.x)||!Number.isFinite(next.y))return null;
    const pair=[...this.points.values()].slice(0,2);
    if(pair.length===2){
      // Measure against the contact-pair baseline. Incremental scale/clamp
      // steps would turn interleaved two-finger translation into zoom drift.
      const before=pair.map(p=>p.origin) as [Point,Point];entry.position=next;
      if(!pair.includes(entry))return null;
      return pinchMovement(before,pair.map(p=>p.position) as [Point,Point]);
    }
    if(!this.moved&&distance(entry.origin,next)<3)return null;
    this.moved=true;this.blockedClick=true;
    const delta={kind:entry.mode,dx:next.x-entry.position.x,dy:next.y-entry.position.y};
    entry.position=next;return delta;
  }
  end(id:number,cancelled=false){
    if(!this.points.delete(id))return false;
    if(cancelled)this.blockedClick=true;
    // Do not replay a pre-pinch orbit delta when the remaining finger moves.
    for(const p of this.points.values())p.origin=p.position;
    this.moved=false;
    return true;
  }
  cancel(){if(this.active)this.blockedClick=true;this.points.clear();this.moved=false;this.multiple=false;}
  suppressClick(event:{detail:number;pointerType?:string}){
    return this.blockedClick&&(event.detail!==0||!!event.pointerType);
  }
}

export function mapWheelMovement(event:{deltaX:number;deltaY:number;deltaMode:number;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean},height:number) {
  if(!Number.isFinite(event.deltaX)||!Number.isFinite(event.deltaY))return null;
  const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
  if(event.ctrlKey||event.metaKey)return {kind:'zoom' as const,scale:Math.exp(-Math.max(-100,Math.min(100,event.deltaY*unit))*.012)};
  return {kind:'pan' as const,dx:-(event.shiftKey&&!event.deltaX?event.deltaY:event.deltaX)*unit,dy:-(event.shiftKey&&!event.deltaX?0:event.deltaY)*unit};
}

// A touch-originated Safari gesture stays ignored through gestureend, even
// when its pointerup arrives first. Desktop trackpad gestures own wheel input.
export class SafariGestureInput {
  private state:'idle'|'desktop'|'touch'='idle';
  get ownsWheel(){return this.state!=='idle';}
  start(touching:boolean){this.state=touching?'touch':'desktop';return !touching;}
  touch(){if(this.state==='desktop')this.state='touch';}
  change(touching:boolean){if(touching)this.touch();return this.state==='desktop';}
  end(){this.state='idle';}
}

export class TimelineDragInput {
  private pointer:{id:number;y:number;startY:number;started:boolean}|null=null;
  get id(){return this.pointer?.id;}
  down(event:InputPoint){
    if(this.pointer||event.pointerType!=='touch'||event.button!==0)return false;
    this.pointer={id:event.pointerId,y:event.clientY,startY:event.clientY,started:false};return true;
  }
  move(event:InputPoint){
    const p=this.pointer;if(!p||p.id!==event.pointerId||!Number.isFinite(event.clientY))return 0;
    if(!p.started&&Math.abs(event.clientY-p.startY)<3)return 0;
    p.started=true;
    // Like a vertical scrollbar: dragging down advances the source.
    const delta=event.clientY-p.y;p.y=event.clientY;return delta;
  }
  end(id:number){if(this.pointer?.id!==id)return false;this.pointer=null;return true;}
}
