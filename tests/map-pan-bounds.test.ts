import test from 'node:test';
import assert from 'node:assert/strict';
import { confinePan, screenWorld } from '../src/features/book-graph/map-framing';
import { GRID_PAN_BOUNDS } from '../src/features/book-graph/grid-bounds';
import { initialView, orientation } from '../src/features/book-graph/projection';

test('all flat views stop at the fade margin at different zooms and viewport sizes',()=>{
  for(const projection of ['xy','xz','yz'] as const)for(const zoom of [1.5,4,16])for(const size of [{width:704,height:720},{width:320,height:500}])for(const sign of [-1,1]) {
    const view={...initialView('test'),projection,...orientation(projection),zoom,framing:{center:{x:0,y:0,z:0},scale:2},x:sign*1e6,y:sign*1e6};
    const bounded=confinePan(view,size),{min,max}=GRID_PAN_BOUNDS;
    const corners=[min.x,max.x].flatMap(x=>[min.y,max.y].flatMap(y=>[min.z,max.z].map(z=>screenWorld({x,y,z},bounded,size))));
    for(const [axis,length] of [['x',size.width],['y',size.height]] as const) {
      const start=Math.min(...corners.map(p=>p[axis])),end=Math.max(...corners.map(p=>p[axis])),margin=Math.min(48,length*.08);
      if(end-start>=length-2*margin){assert.ok(start<=margin+1e-7);assert.ok(end>=length-margin-1e-7);}
      else assert.ok(Math.abs((start+end)/2-length/2)<=margin+1e-7);
    }
    assert.equal(bounded.zoom,zoom);assert.equal(bounded.yaw,view.yaw);assert.equal(bounded.pitch,view.pitch);
    assert.deepEqual(confinePan(bounded,size),bounded);
    const reversed=confinePan({...bounded,x:bounded.x-sign,y:bounded.y-sign},size);
    assert.equal(reversed.x,bounded.x-sign);assert.equal(reversed.y,bounded.y-sign);
  }
});

test('3D cameras and unmeasured viewports remain unchanged',()=>{
  const view={...initialView('test'),x:1e6,y:-1e6};
  assert.equal(confinePan(view,{width:704,height:720}),view);
  const flat={...view,projection:'xy' as const};
  assert.equal(confinePan(flat,{width:0,height:0}),flat);
});
