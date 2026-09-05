// Pixel-normalized wheel input, with a short, bounded ease-out. Keep input
// intent separate from animation so a reversal never fights old momentum.
export function timelineWheelDelta(event: {deltaX:number;deltaY:number;deltaMode:number;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;buttons:number}, height:number) {
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.buttons||!Number.isFinite(event.deltaY)||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return 0;
  return Math.max(-height,Math.min(height,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?height:1)));
}
export class TimelineScroll {
  pending=0;
  private energy=0;
  private lastTime:number|null=null;
  private direction=0;
  reset(){this.pending=0;this.energy=0;this.lastTime=null;this.direction=0;}
  push(delta:number,now:number,height:number){
    if(!delta)return;
    const elapsed=this.lastTime===null?Infinity:Math.max(0,now-this.lastTime);
    if(Math.sign(delta)!==this.direction||elapsed>220)this.reset();
    this.energy=this.energy*Math.exp(-elapsed/100)+Math.abs(delta);
    const gain=5+19*(1-Math.exp(-this.energy/260));
    this.pending=Math.max(-height*12,Math.min(height*12,this.pending+delta*gain));
    this.lastTime=now;this.direction=Math.sign(delta);
  }
  step(elapsed:number){
    const delta=this.pending*(1-Math.exp(-Math.min(64,Math.max(0,elapsed))/55));
    this.pending-=delta;
    if(Math.abs(this.pending)<.5){const rest=this.pending;this.pending=0;return delta+rest;}
    return delta;
  }
}
