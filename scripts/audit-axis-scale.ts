import { readFile } from 'node:fs/promises';
import { GraphSchema } from '../src/shared/schemas';
import { depthInconsistencies } from '../src/server/book-analysis/axis-calibration';

// Compare persisted semantic positions, independent of camera, zoom and badges.
// Usage: node --import tsx scripts/audit-axis-scale.ts old-graph.json new-graph.json
async function main() {
for(const file of process.argv.slice(2)) {
  const graph=GraphSchema.parse(JSON.parse(await readFile(file,'utf8')));
  const placed=graph.nodes.filter(n=>n.position.x!==null&&n.position.y!==null);
  const counts=(axes:('x'|'y')[])=>{
    const bins=new Map<string,number>();
    for(const n of placed){const key=JSON.stringify(axes.map(a=>n.position[a]));bins.set(key,(bins.get(key)??0)+1);}
    return {distinct:bins.size,largestTie:Math.max(0,...bins.values())};
  };
  console.log(JSON.stringify({file,graphVersion:graph.graphVersion,axisVersion:graph.axisVersion,nodes:graph.nodes.length,placed:placed.length,unplaced:graph.nodes.length-placed.length,x:counts(['x']),y:counts(['y']),xy:counts(['x','y']),prerequisiteDepthConflicts:depthInconsistencies(graph).length},null,2));
}
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
