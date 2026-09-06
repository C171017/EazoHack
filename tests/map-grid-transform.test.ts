import test from 'node:test';
import assert from 'node:assert/strict';
import { gridPlaneTransform, ORIGIN } from '../src/features/book-graph/map-grid';
import { screenWorld } from '../src/features/book-graph/map-framing';
import { initialView, orientation } from '../src/features/book-graph/projection';

test('retained grid planes match projected world coordinates through pan, zoom and orbit',()=>{
  for(const projection of ['3d','xy','xz','yz'] as const)for(const zoom of [1.5,4,16])for(const pan of [-300,0,420]) {
    const view={...initialView('test'),projection,...orientation(projection),zoom,x:pan,y:-pan/2,
      framing:{scale:1.7,center:{x:73,y:-112,z:240}}};
    const size={width:1100,height:900};
    const screen=(p:typeof ORIGIN)=>screenWorld(p,view,size);
    const origin=screen(ORIGIN);
    for(const [u,v] of [['x','y'],['x','z'],['y','z']] as const) {
      const a=screen({...ORIGIN,[u]:ORIGIN[u]+1}),b=screen({...ORIGIN,[v]:ORIGIN[v]+1});
      const matrix=gridPlaneTransform(origin,{x:a.x-origin.x,y:a.y-origin.y},{x:b.x-origin.x,y:b.y-origin.y});
      const [xx,xy,yx,yy,tx,ty]=matrix.slice(7,-1).split(' ').map(Number);
      for(const x of [-150,0,50,1000])for(const y of [-1000,0,300,1000]) {
        const expected=screen({...ORIGIN,[u]:ORIGIN[u]+x,[v]:ORIGIN[v]+y});
        assert.ok(Math.abs(xx*x+yx*y+tx-expected.x)<1e-7);
        assert.ok(Math.abs(xy*x+yy*y+ty-expected.y)<1e-7);
      }
    }
  }
});
