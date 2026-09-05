import type { Graph, MapView } from '../../shared/schemas';

export const SPATIAL_PAGE_SIZE = 24;
export function mapWindow(graph: Graph, view: MapView, excerptRange: [number, number]) {
  const filtered = graph.nodes.filter(n =>
    (!view.themeFilter || n.themeTerritoryIds.includes(view.themeFilter)) &&
    (!view.roleFilter || n.sourceRole === view.roleFilter) &&
    (view.sourceScope !== 'excerpt' || n.position.z === null || n.position.z >= excerptRange[0] && n.position.z <= excerptRange[1]));
  const pages = Math.max(1, Math.ceil(filtered.length / SPATIAL_PAGE_SIZE));
  const page = Math.min(view.nodePage ?? 0, pages - 1);
  return { filtered, pages, page, spatial: filtered.slice(page * SPATIAL_PAGE_SIZE, (page + 1) * SPATIAL_PAGE_SIZE) };
}
