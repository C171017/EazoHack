import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadMapStore, mapBootstrap } from '../src/server/book-map/store';
import { semanticWindow } from '../src/features/book-graph/semantic-window';
import { initialView } from '../src/features/book-graph/projection';
import { ZOOM_POLICY } from '../src/shared/zoom-hierarchy';
async function main(){
  const store=await loadMapStore(),{hierarchy:h,entries}=store,bootstrap=mapBootstrap(store);
  const pages=new Map(Object.entries(h.children).map(([id,ids])=>[id,ids.map(id=>entries.get(id)!)]));
  const times:number[]=[];let maxNodes=0,maxRequests=0;
  for(let i=0;i<2200;i++){
    const view={...initialView(store.graph.graphVersion),sourceScope:'book' as const,zoom:.5+47.5*(i%100)/99,yaw:i*.017,pitch:Math.sin(i*.01)*Math.PI/2,x:Math.sin(i*.11)*500,y:Math.cos(i*.09)*300};
    const start=performance.now();const cut=semanticWindow(bootstrap.roots,pages,view,{width:800,height:500},[0,1],Math.min(h.depth,Math.floor(i/100)%5));
    const elapsed=performance.now()-start;if(i>=200)times.push(elapsed);maxNodes=Math.max(maxNodes,cut.nodes.length);
    maxRequests=Math.max(maxRequests,semanticWindow(bootstrap.roots,new Map(),view,{width:800,height:500},[0,1],h.depth).wanted.length);
    if(cut.nodes.length>ZOOM_POLICY.nodes)throw new Error('Node budget exceeded');
  }
  times.sort((a,b)=>a-b);
  const report={date:new Date().toISOString(),version:h.version,environment:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,node:process.version},scope:'Node.js selector microbenchmark over real generated hierarchy; not browser frame time, cold-load latency, or baseline-device certification.',samples:times.length,selectorMs:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},maxVisibleNodes:maxNodes,maxMissingRootRequests:maxRequests,bootstrapBytes:Buffer.byteLength(JSON.stringify(bootstrap)),fullGraphBytes:Buffer.byteLength(JSON.stringify(store.graph)),leafCount:store.graph.nodes.length,clusterCount:h.entries.length-store.graph.nodes.length,depth:h.depth,roots:h.roots.length,policy:ZOOM_POLICY};
  const file=path.join('data/books/plato-republic/analysis',h.version,'selector-benchmark.json');await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
