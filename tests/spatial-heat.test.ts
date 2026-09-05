import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHeatVolume, fieldDensity, heatKernel, heatRgb, HEAT_RADIUS, HEAT_SIGMA, HEAT_GRID, HEAT_COLORS } from '../src/features/book-graph/heat-field';
import { heatSourceIndex, type HeatPoint } from '../src/features/book-graph/heat-placement';
import { project, orientation, sourceWorld } from '../src/features/book-graph/projection';
import { loadMapStore, heatIndexPage } from '../src/server/book-map/store';
import { GET } from '../src/app/api/book-map/route';

const p = { x: 0, y: 0, z: 0 };
function point(id: string, position = { x: .5, y: 2, z: .5 }, weight = 1): HeatPoint {
  return { leaf: { id, label: id, position, ranges: [{start:0,end:10}] }, events: [], nearest: 0,
    counts: { explanation: weight, diagram: 0, interactive: 0, illustration: 0 } };
}

test('one source is green with smooth spherical falloff and no hard boundary', () => {
  assert.equal(heatKernel(0), 1);
  assert.ok(heatKernel(HEAT_SIGMA ** 2) > heatKernel((HEAT_SIGMA * 2) ** 2));
  assert.equal(heatKernel(HEAT_RADIUS ** 2), 0);
  assert.ok(heatKernel((HEAT_RADIUS - .001) ** 2) < .00001);
  const seeds = [{ position: p, weight: 1 }];
  assert.equal(fieldDensity({x:32,y:0,z:0},seeds), fieldDensity({x:0,y:0,z:32},seeds));
  assert.deepEqual(heatRgb(1), HEAT_COLORS[0].rgb);
  assert.deepEqual(heatRgb(4), HEAT_COLORS[1].rgb);
  assert.deepEqual(heatRgb(12), HEAT_COLORS[3].rgb);
});

test('nearby sources fuse by adding scalar density before coloring', () => {
  const seeds = [{position:{x:-HEAT_SIGMA/2,y:0,z:0},weight:3},{position:{x:HEAT_SIGMA/2,y:0,z:0},weight:3}];
  const middle = fieldDensity(p,seeds);
  assert.ok(middle > 5 && middle < 6);
  assert.deepEqual(fieldDensity(p,[{position:p,weight:12}]),12);
  assert.notDeepEqual(heatRgb(middle),heatRgb(3));
});

test('screen overlap cannot create false 3D accumulation; all projections retain source coordinates', () => {
  const a={x:0,y:0,z:0},b={x:0,y:0,z:300};
  const xy=orientation('xy');
  assert.ok(Math.abs(project(a,xy).y-project(b,xy).y)<1e-10);
  const seeds=[{position:a,weight:1},{position:b,weight:1}];
  assert.equal(fieldDensity(a,seeds),1); assert.equal(fieldDensity(b,seeds),1);
  assert.equal(fieldDensity({x:0,y:0,z:150},seeds),0);
  const source={x:.3,y:2.5,z:.7};
  assert.ok(Math.abs(sourceWorld(source,[0,1],.2).z-sourceWorld(source,[0,1],0).z-160)<1e-8);
});

test('volume memory and resolution are bounded; duplicate generations at a leaf use a single seed', () => {
  const input=[point('a',undefined,12),point('b',{x:.7,y:2.1,z:.53},3)];
  const volume=buildHeatVolume(input,'explanation')!;
  assert.equal(volume.data.byteLength,HEAT_GRID.reduce((a,b)=>a*b,1));
  assert.equal(volume.seeds.length,2);
  assert.equal(buildHeatVolume(input,'diagram'),null);
  assert.ok(volume.data.some(v=>v>240));
  assert.deepEqual(buildHeatVolume(input,'explanation')!.data,volume.data);
  const large=buildHeatVolume(Array.from({length:500},(_,i)=>point(String(i),{x:i/500,y:i%5,z:i/500})),'explanation')!;
  assert.equal(large.data.length,volume.data.length);
});

test('real book heat index covers leaves only and API preserves version/source identity with bounded pages', async () => {
  const store=await loadMapStore(),index=heatSourceIndex(store.graph);
  assert.equal(index.leaves.length,store.graph.nodes.length);
  assert.ok(index.leaves.every(leaf=>store.entries.get(leaf.id)?.kind==='occurrence'));
  assert.ok(index.leaves.every(leaf=>leaf.ranges.every(r=>r.start>=0&&r.end<=index.sourceLength)));
  assert.ok(heatIndexPage(store).leaves.length<=512);
  const response=await GET(new Request(`http://localhost/api/book-map?kind=heat-index&version=${store.hierarchy.version}`));
  assert.equal(response.status,200);
  const body=await response.json(); assert.equal(body.fileHash,store.graph.fileHash);
  assert.equal((await GET(new Request('http://localhost/api/book-map?kind=heat-index&version=old'))).status,409);
  assert.equal((await GET(new Request(`http://localhost/api/book-map?kind=heat-index&offset=-1&version=${store.hierarchy.version}`))).status,400);
});
