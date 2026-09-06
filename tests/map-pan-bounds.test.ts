import test from 'node:test';
import assert from 'node:assert/strict';
import { confinePan, screenWorld } from '../src/features/book-graph/map-framing';
import { GRID_PAN_BOUNDS } from '../src/features/book-graph/grid-bounds';
import { initialView, orientation } from '../src/features/book-graph/projection';

test('all projections stop at the fade margin at different zooms and viewport sizes',()=>{
  for(const projection of ['3d','xy','xz','yz'] as const)for(const zoom of [1.5,4,16])for(const size of [{width:704,height:720},{width:320,height:500}])for(const sign of [-1,1]) {
    const view={...initialView('test'),projection,...orientation(projection),zoom,framing:{center:{x:0,y:0,z:0},scale:2},x:sign*1e6,y:sign*1e6};
    const bounded=confinePan(view,size),{min,max}=GRID_PAN_BOUNDS;
    const corners=[min.x,max.x].flatMap(x=>[min.y,max.y].flatMap(y=>[min.z,max.z].map(z=>screenWorld({x,y,z},bounded,size))));
    for(const [axis,length] of [['x',size.width],['y',size.height]] as const) {
      const start=Math.min(...corners.map(p=>p[axis])),end=Math.max(...corners.map(p=>p[axis])),margin=Math.min(48,length*.08);
      if(end-start>=length){assert.ok(start<=margin+1e-7);assert.ok(end>=length-margin-1e-7);}
      else assert.ok(Math.abs((start+end)/2-length/2)<=margin+1e-7);
    }
    assert.equal(bounded.zoom,zoom);assert.equal(bounded.yaw,view.yaw);assert.equal(bounded.pitch,view.pitch);
    assert.deepEqual(confinePan(bounded,size),bounded);
    const reversed=confinePan({...bounded,x:bounded.x-sign,y:bounded.y-sign},size);
    assert.equal(reversed.x,bounded.x-sign);assert.equal(reversed.y,bounded.y-sign);
  }
});

test('pan limits do not jump as zoom crosses the viewport-fit threshold',()=>{
  const size={width:704,height:720};
  for(const projection of ['3d','xy','xz','yz'] as const) {
    const view={...initialView('test'),projection,...orientation(projection),x:0,y:0};
    const {min,max}=GRID_PAN_BOUNDS;
    const corners=[min.x,max.x].flatMap(x=>[min.y,max.y].flatMap(y=>[min.z,max.z].map(z=>screenWorld({x,y,z},view,size))));
    const span=Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x));
    for(const width of [size.width-96,size.width]) {
      const zoom=view.zoom*width/span;
      const before=confinePan({...view,zoom:zoom-1e-7,x:1e6},size);
      const after=confinePan({...view,zoom:zoom+1e-7,x:1e6},size);
      assert.ok(Math.abs(after.x-before.x)<.001,`${projection}: ${before.x} → ${after.x}`);
    }
  }
});

test('unmeasured viewports remain unchanged',()=>{
  const view={...initialView('test'),x:1e6,y:-1e6};
  assert.equal(confinePan(view,{width:0,height:0}),view);
  const flat={...view,projection:'xy' as const};
  assert.equal(confinePan(flat,{width:0,height:0}),flat);
});

test('a restored offscreen 3D camera stays bounded through orbit and responds to reversal',()=>{
  const size={width:704,height:720};
  for(const yaw of [-Math.PI/2,-1,-.1,0])for(const pitch of [0,.36,1,Math.PI/2]) {
    const view={...initialView('test'),yaw,pitch,x:10800,y:-10800};
    const bounded=confinePan(view,size);
    assert.ok(Math.abs(bounded.x)<10800&&Math.abs(bounded.y)<10800);
    assert.deepEqual(confinePan({...bounded,x:bounded.x+10000,y:bounded.y-10000},size),bounded);
    const reversed=confinePan({...bounded,x:bounded.x-1,y:bounded.y+1},size);
    assert.equal(reversed.x,bounded.x-1);
    assert.equal(reversed.y,bounded.y+1);
    assert.equal(reversed.zoom,view.zoom);
    assert.equal(reversed.yaw,yaw);
    assert.equal(reversed.pitch,pitch);
  }
});
