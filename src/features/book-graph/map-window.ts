import type { Graph, MapView } from '../../shared/schemas';

export const SPATIAL_PAGE_SIZE = 12;
export function mapWindow(graph: Graph, view: MapView, excerptRange: [number, number], pageSize = SPATIAL_PAGE_SIZE) {
  pageSize = Math.max(1, Math.min(SPATIAL_PAGE_SIZE, Math.floor(pageSize)));
  const filtered = graph.nodes.filter(n =>
    (!view.themeFilter || n.themeTerritoryIds.includes(view.themeFilter)) &&
    (!view.roleFilter || n.sourceRole === view.roleFilter) &&
    (view.sourceScope !== 'excerpt' || n.position.z === null || n.position.z >= excerptRange[0] && n.position.z <= excerptRange[1]));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(view.nodePage ?? 0, pages - 1);
  return { filtered, pages, page, pageSize, spatial: filtered.slice(page * pageSize, (page + 1) * pageSize) };
}
