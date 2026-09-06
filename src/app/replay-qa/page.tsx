import { loadMapStore, mapBootstrap } from '@/server/book-map/store';
import { heatSourceIndex } from '@/features/book-graph/heat-placement';
import { ReplayQA } from './replay-qa';
export default async function Page() {
  const store = await loadMapStore();
  return <ReplayQA graph={mapBootstrap(store)} leaves={heatSourceIndex(store.graph).leaves.filter(l => l.position).filter((_, i) => [40, 95, 150, 210, 260].includes(i))} />;
}
