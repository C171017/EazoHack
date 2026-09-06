import { selectedCloudBook } from '@/server/cloud/map';
import { redirect } from 'next/navigation';
import { getBookPreview, getChineseBookPreview } from '@/features/reader/book-preview';
import { Workspace } from '@/features/assistance/workspace';
import { connection } from 'next/server';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { loadMapStore, mapBootstrap } from '@/server/book-map/store';

export default async function Page({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  await connection();
  const { book } = await searchParams;
  if (book === 'hong-lou-meng') {
    const preview = await getChineseBookPreview();
    const graph: MapBootstrap = {bookId: 'hong-lou-meng', graphVersion: 'sample-pending', version: 'sample-pending', roots: [], depth: 0, totalNodes: 0, unplaced: 0, territories: [], unavailable: true};
    return <Workspace key="hong-lou-meng" preview={preview} graph={graph} initialTitle="红楼梦"/>;
  }
  let cloud;try {cloud=book === 'plato-republic' ? null : await selectedCloudBook();} catch {redirect('/cloud');}
  if(cloud)return <Workspace key={cloud.sourceId} preview={cloud.preview} graph={cloud.graph} initialTitle={cloud.title} cloudSourceId={cloud.sourceId}/>;
  const preview = await getBookPreview();
  let graph:MapBootstrap;
  try { graph=mapBootstrap(await loadMapStore()); }
  catch(error) {
    console.error('Book map unavailable:',error instanceof Error?error.message:'Unknown map error');
    graph={bookId:'plato-republic',graphVersion:'map-unavailable',version:'map-unavailable',roots:[],depth:0,totalNodes:0,unplaced:0,territories:[],unavailable:true};
  }
  return <Workspace key="plato-republic" preview={preview} graph={graph} />;
}
