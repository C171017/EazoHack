import test from 'node:test';
import assert from 'node:assert/strict';
import {TimelineScroll,timelineWheelDelta} from '../src/features/book-graph/timeline-scroll';
const wheel={deltaX:0,deltaY:100,deltaMode:0,ctrlKey:false,metaKey:false,shiftKey:false,buttons:0};
test('timeline accepts vertical wheels, not pinch, horizontal movement or pressed-button gestures',()=>{
  assert.equal(timelineWheelDelta(wheel,800),100);
  for(const patch of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{buttons:1},{deltaX:110},{deltaY:0}])assert.equal(timelineWheelDelta({...wheel,...patch},800),0);
  assert.equal(timelineWheelDelta({...wheel,deltaMode:1,deltaY:3},800),48);
  assert.equal(timelineWheelDelta({...wheel,deltaMode:2,deltaY:-1},800),-800);
});
test('skim accelerates above reading speed, remains bounded, and eases to a stop',()=>{
  const motion=new TimelineScroll();motion.push(40,0,800);const slow=motion.pending;
  assert.ok(slow>40*5);
  motion.push(40,30,800);assert.ok(motion.pending-slow>slow);
  for(let i=2;i<100;i++)motion.push(400,i*30,800);
  assert.ok(motion.pending<=800*12);
  const first=motion.step(16),second=motion.step(16);assert.ok(first>second);
  for(let i=0;i<100;i++)motion.step(16);
  assert.equal(motion.pending,0);
});
test('reversal and cancellation discard old motion; pauses reset acceleration',()=>{
  const motion=new TimelineScroll();motion.push(200,0,800);motion.push(-10,20,800);
  assert.ok(motion.pending<0);assert.ok(Math.abs(motion.pending)<100);
  motion.reset();assert.equal(motion.step(16),0);
  motion.push(30,0,800);const initial=motion.pending;motion.push(30,500,800);assert.equal(motion.pending,initial);
});
