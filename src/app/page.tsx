import { getBookPreview } from '@/features/reader/book-preview';
import { Workspace } from '@/features/assistance/workspace';
import { connection } from 'next/server';
import { loadRepublicGraph } from '@/server/book-analysis/load';

export default async function Page() {
  await connection();
  const preview = await getBookPreview();
  return <Workspace preview={preview} graph={await loadRepublicGraph(preview)} />;
}
