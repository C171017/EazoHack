import { selectedCloudBook } from '@/server/cloud/map';
import { redirect } from 'next/navigation';
import { getBookPreview } from '@/features/reader/book-preview';
import { Workspace } from '@/features/assistance/workspace';
import { connection } from 'next/server';
import type { MapBootstrap } from '@/shared/zoom-hierarchy';
import { loadMapStore, mapBootstrap } from '@/server/book-map/store';

export default async function Page() {
  await connection();
  let cloud;try {cloud=await selectedCloudBook();} catch {redirect('/cloud');}
  if(cloud)return <Workspace preview={cloud.preview} graph={cloud.graph} initialTitle={cloud.title} cloudSourceId={cloud.sourceId}/>;
  const preview = await getBookPreview();
  let graph:MapBootstrap;
  try { graph=mapBootstrap(await loadMapStore()); }
  catch(error) {
    console.error('Book map unavailable:',error instanceof Error?error.message:'Unknown map error');
    graph={bookId:'plato-republic',graphVersion:'map-unavailable',version:'map-unavailable',roots:[],depth:0,totalNodes:0,unplaced:0,territories:[],unavailable:true};
  }
  return <Workspace preview={preview} graph={graph} />;
}
