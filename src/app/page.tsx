import { getBookPreview } from '@/features/reader/book-preview';
import { Workspace } from '@/features/assistance/workspace';
export default async function Page() { return <Workspace preview={await getBookPreview()} />; }
