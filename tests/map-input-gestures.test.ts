import test from 'node:test';
import assert from 'node:assert/strict';
import {InputFrame} from '../src/features/book-graph/input-frame';
import {MapPointerInput, SafariGestureInput, TimelineDragInput, mapWheelMovement, pinchMovement, pinchView, type InputPoint} from '../src/features/book-graph/map-input';
import {initialView, beginOrbit, advanceOrbit} from '../src/features/book-graph/projection';
import {ZOOM_POLICY} from '../src/shared/zoom-hierarchy';

const contact=(id:number,x:number,y:number,patch:Partial<InputPoint>={}):InputPoint=>({pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,...patch});
const mouse=(button=0)=>contact(1,100,100,{pointerType:'mouse',button});
function clock(){
  let id=0;const callbacks=new Map<number,()=>void>();
  return {callbacks,request:(callback:()=>void)=>{callbacks.set(++id,callback);return id;},cancel:(id:number)=>{callbacks.delete(id);},tick:()=>{const ready=[...callbacks.values()];callbacks.clear();ready.forEach(callback=>callback());}};
}

test('single pointer orbit keeps incremental deltas, reversal and camera zoom',()=>{
  for(const pointerType of ['mouse','pen','touch']){
    const input=new MapPointerInput(),start=mouse();start.pointerType=pointerType;
    assert.equal(input.down(start),true);
    assert.equal(input.move({...start,clientX:102}),null);
    const camera={...initialView('input'),zoom:4};let motion=beginOrbit(camera);
    for(const [x,y,dx,dy] of [[112,109,12,9],[108,104,-4,-5],[110,105,2,1]]){
      const movement=input.move({...start,clientX:x,clientY:y});
      assert.deepEqual(movement,{kind:'orbit',dx,dy});
      motion=advanceOrbit(motion,dx,dy);
      assert.equal({...camera,...motion.display}.zoom,4);
    }
    assert.equal(input.canSettle,true);
    input.end(1);assert.equal(input.active,false);
  }
});

test('right and middle drag pan; desktop node presses and unrelated pointers do not hijack a drag',()=>{
  for(const button of [1,2]){
    const input=new MapPointerInput(),start=mouse(button);
    assert.equal(input.down(start,true),false);
    assert.equal(input.down(start),true);
    assert.equal(input.down(contact(2,0,0)),false);
    assert.equal(input.move(contact(99,200,200)),null);
    assert.deepEqual(input.move({...start,clientX:130,clientY:90}),{kind:'pan',dx:30,dy:-10});
    assert.equal(input.canSettle,false);
  }
  assert.equal(new MapPointerInput().down(mouse(3)),false);
});

test('pinch geometry separates scale from centroid translation and tolerates coincident contacts',()=>{
  assert.deepEqual(pinchMovement([{x:0,y:0},{x:100,y:0}],[{x:-20,y:30},{x:180,y:30}]),{kind:'pinch',scale:2,dx:30,dy:30});
  assert.deepEqual(pinchMovement([{x:0,y:0},{x:0,y:0}],[{x:0,y:0},{x:20,y:0}]),{kind:'pinch',scale:1,dx:10,dy:0});
});

test('interleaved two-finger pan returns to the original zoom even at a zoom limit',()=>{
  for(const zoom of [ZOOM_POLICY.minZoom,4,ZOOM_POLICY.maxZoom]){
    const input=new MapPointerInput();input.down(contact(1,100,100));input.down(contact(2,200,100));
    const base={...initialView('input'),zoom,x:15,y:20,framing:{center:{x:0,y:0,z:0},scale:1}};
    const size={width:700,height:700};
    const first=input.move(contact(1,120,130));assert.equal(first?.kind,'pinch');
    const second=input.move(contact(2,220,130));assert.equal(second?.kind,'pinch');
    if(first?.kind!=='pinch'||second?.kind!=='pinch')throw new Error('Missing pinch');
    // Intermediate browser events may report a transient scale. The next
    // event is relative to the shared baseline, not a clamped prior frame.
    pinchView(base,first,size,[],.5);
    const final=pinchView(base,second,size,[],.5);
    assert.equal(final.zoom,zoom);assert.equal(final.x,35);assert.equal(final.y,50);
    assert.equal(final.yaw,base.yaw);assert.equal(final.pitch,base.pitch);
    assert.deepEqual(final.framing,base.framing);
    assert.equal(final.readerAnchorId,base.readerAnchorId);
  }
});

test('pinch expands semantic zoom, remains bounded and retains the source anchor',()=>{
  const base={...initialView('input'),zoom:4,readerAnchorId:'source-1'};
  const next=pinchView(base,{kind:'pinch',scale:2,dx:0,dy:0},{width:700,height:700},[],.5);
  assert.equal(next.zoom,8);assert.equal(next.readerAnchorId,'source-1');
  assert.equal(pinchView(base,{kind:'pinch',scale:10000,dx:0,dy:0},{width:700,height:700},[],.5).zoom,ZOOM_POLICY.maxZoom);
});

test('spare fingers and two-to-one handoff rebase without orbit jumps or release snapping',()=>{
  const input=new MapPointerInput();input.down(contact(1,0,0));input.down(contact(2,100,0));
  input.move(contact(1,-20,0));input.down(contact(3,50,50));
  assert.equal(input.move(contact(3,70,70)),null);
  assert.equal(input.end(99,true),false);assert.equal(input.active,true);
  input.end(2);
  assert.deepEqual(input.move(contact(3,90,70)),{kind:'pinch',dx:10,dy:0,scale:Math.hypot(110,70)/Math.hypot(90,70)});
  input.end(3);
  assert.equal(input.move(contact(1,-19,0)),null);
  assert.deepEqual(input.move(contact(1,-15,0)),{kind:'orbit',dx:5,dy:0});
  assert.equal(input.canSettle,false);
});

test('touch tap can activate a node; drag, multi-touch and cancellation cannot; keyboard still works',()=>{
  const input=new MapPointerInput();assert.equal(input.down(contact(1,0,0),true),true);
  input.end(1);assert.equal(input.suppressClick({detail:1,pointerType:'touch'}),false);
  for(const kind of ['drag','multi','cancel']){
    input.down(contact(1,0,0),true);
    if(kind==='drag')input.move(contact(1,10,10));
    if(kind==='multi')input.down(contact(2,100,0),true);
    if(kind==='cancel')input.cancel();else input.ids.forEach(id=>input.end(id));
    assert.equal(input.suppressClick({detail:1}),true);
    assert.equal(input.suppressClick({detail:0,pointerType:'touch'}),true);
    assert.equal(input.suppressClick({detail:0}),false);
    assert.equal(input.active,false);
  }
  input.down(mouse());input.end(1);assert.equal(input.suppressClick({detail:1}),false);
});

test('lost capture and cancellation ignore foreign IDs, clear contacts and allow a fresh session',()=>{
  const input=new MapPointerInput();input.down(contact(1,0,0));input.move(contact(1,10,0));
  assert.equal(input.end(2,true),false);assert.equal(input.active,true);
  assert.equal(input.end(1,true),true);assert.equal(input.end(1,true),false);
  assert.equal(input.move(contact(1,50,0)),null);
  input.down(contact(2,0,0));input.down(contact(3,100,0));input.cancel();
  assert.equal(input.touching,false);assert.equal(input.canSettle,false);
  assert.equal(input.down(mouse()),true);
});

test('fresh mouse and pen node presses clear old drag/cancel suppression for successive clicks',()=>{
  for(const pointerType of ['mouse','pen'])for(const cancelled of [false,true]){
    const input=new MapPointerInput(),start={...mouse(),pointerType};
    input.down(start);input.move({...start,clientX:130});input.end(start.pointerId,cancelled);
    // The completed drag's synthesized click must remain blocked.
    assert.equal(input.suppressClick({detail:1,pointerType}),true);
    for(let detail=1;detail<=3;detail++){
      assert.equal(input.down(start,true),false); // node owns this fresh press
      assert.equal(input.active,false);
      input.end(start.pointerId);
      assert.equal(input.suppressClick({detail,pointerType}),false,`${pointerType}, cancelled=${cancelled}, click=${detail}`);
    }
  }
});

test('wheel preserves pixel, Windows line/page, shift pan and modifier pinch semantics',()=>{
  const wheel={deltaX:2,deltaY:3,deltaMode:0,ctrlKey:false,metaKey:false,shiftKey:false};
  for(const [deltaMode,unit] of [[0,1],[1,16],[2,800]]){
    assert.deepEqual(mapWheelMovement({...wheel,deltaMode},800),{kind:'pan',dx:-2*unit,dy:-3*unit});
    assert.deepEqual(mapWheelMovement({...wheel,deltaMode,deltaX:0,shiftKey:true},800),{kind:'pan',dx:-3*unit,dy:-0});
    for(const modifier of ['ctrlKey','metaKey'])assert.deepEqual(mapWheelMovement({...wheel,deltaMode,[modifier]:true},800),{kind:'zoom',scale:Math.exp(-Math.min(100,3*unit)*.012)});
  }
  assert.equal(mapWheelMovement({...wheel,deltaY:NaN},800),null);
});

test('Safari desktop gestures own wheels, touch overlap stays ignored through the last gesture event',()=>{
  const safari=new SafariGestureInput();assert.equal(safari.ownsWheel,false);
  assert.equal(safari.start(false),true);assert.equal(safari.ownsWheel,true);assert.equal(safari.change(false),true);
  safari.end();assert.equal(safari.ownsWheel,false);
  assert.equal(safari.start(true),false);assert.equal(safari.change(true),false);
  assert.equal(safari.change(false),false); // pointerup before gestureend
  safari.end();assert.equal(safari.start(false),true);
  safari.touch();assert.equal(safari.change(false),false); // gesturestart before second pointer
  safari.end();assert.equal(safari.start(false),true);
});

test('RAF coalesces absolute cameras but retains the last update when released before a frame',()=>{
  const time=clock(),published:number[]=[];const queue=new InputFrame<number>(value=>published.push(value),time.request,time.cancel);
  queue.push(1);queue.push(2);queue.push(3);
  assert.equal(time.callbacks.size,1);assert.deepEqual(published,[]);
  time.tick();assert.deepEqual(published,[3]);assert.equal(queue.pending,false);
  queue.push(4);queue.push(5);queue.flush();queue.flush();time.tick();
  assert.deepEqual(published,[3,5]);assert.equal(time.callbacks.size,0);
  queue.push(6);queue.dispose();time.tick();assert.deepEqual(published,[3,5]);
  // React strict-effect cleanup can dispose and subsequently reuse the queue.
  queue.push(7);time.tick();assert.deepEqual(published,[3,5,7]);
});

test('touch timeline drag accumulates source distance including release and cancellation flushes',()=>{
  const time=clock(),published:number[]=[];const drag=new TimelineDragInput();
  const queue=new InputFrame<number>(value=>published.push(value),time.request,time.cancel,(a,b)=>a+b);
  const move=(event:InputPoint)=>{const delta=drag.move(event);if(delta)queue.push(delta);};
  assert.equal(drag.down(mouse()),false);assert.equal(drag.down(contact(1,0,100)),true);
  assert.equal(drag.down(contact(2,0,0)),false);
  move(contact(1,500,102));assert.equal(queue.pending,false); // horizontal motion does not scroll
  move(contact(2,0,200));assert.equal(queue.pending,false);
  move(contact(1,500,110));move(contact(1,500,125));move(contact(1,500,140));
  drag.end(1);queue.flush();time.tick();assert.deepEqual(published,[40]);
  drag.down(contact(2,0,100));move(contact(2,0,90));move(contact(2,0,85));
  assert.equal(drag.end(99),false);drag.end(2);queue.flush();
  assert.deepEqual(published,[40,-15]);assert.equal(drag.id,undefined);
  move(contact(2,0,0));assert.equal(queue.pending,false);
});
