// Inject the clock so coalescing, final flushes and teardown are testable
// without a DOM. Merge absolute cameras by replacement, source deltas by sum.
export class InputFrame<T> {
  private frame:number|null=null;
  private value:T|undefined;
  get pending(){return this.frame!==null;}
  constructor(private publish:(value:T)=>void,private request:(callback:()=>void)=>number,
    private cancel:(id:number)=>void,private merge:(previous:T,next:T)=>T=(_,next)=>next){}
  push(value:T){
    this.value=this.pending?this.merge(this.value as T,value):value;
    if(this.frame===null)this.frame=this.request(()=>{this.frame=null;const value=this.value as T;this.value=undefined;this.publish(value);});
  }
  flush(){
    if(this.frame===null)return;
    this.cancel(this.frame);this.frame=null;
    const value=this.value as T;this.value=undefined;this.publish(value);
  }
  dispose(){if(this.frame!==null)this.cancel(this.frame);this.frame=null;this.value=undefined;}
}
