import { backend, cloudConfig, serviceKey } from './backend';
import { RequestBodyError } from '../http';
import { z } from 'zod';

type AccountUser = { id: string; token: string; email?: string };
type Source = { id: string; source_object: string; original_object: string | null; manifest: { sourceBytes?: number } };
export const ACCOUNT_LIMITS = {
  books: 100, sourceVersions: 500, sourceBytes: 100 * 1024 * 1024,
  sourceFileBytes: 50 * 1024 * 1024, snapshotBytes: 100 * 1024 * 1024,
} as const;

export async function assertAccountActive(user: AccountUser): Promise<void> {
  const rows = await backend<{ owner_id: string }[]>(`/rest/v1/account_state?owner_id=eq.${user.id}&select=owner_id`, user.token);
  if (rows.length) throw new RequestBodyError('Account deletion is in progress. Retry deletion from account settings.', 409);
}

async function allRows<T>(table: string, user: AccountUser, order = 'id', select = '*'): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await backend<T[]>(`/rest/v1/${table}?owner_id=eq.${user.id}&select=${select}&order=${order}&limit=100&offset=${offset}`, user.token);
    result.push(...page);
    if (page.length < 100) return result;
  }
}

export async function accountSummary(user: AccountUser) {
  const [books, sources, state] = await Promise.all([
    allRows<{ id: string }>('books', user, 'id', 'id'),
    allRows<Source>('book_sources', user, 'id', 'id,manifest'),
    backend<{ deleting_at: string }[]>(`/rest/v1/account_state?owner_id=eq.${user.id}&select=deleting_at`, user.token),
  ]);
  return {
    status: state.length ? 'deleting' as const : 'active' as const,
    books: books.length,
    sourceBytes: sources.reduce((total, source) => total + (source.manifest.sourceBytes ?? 0), 0),
    limits: ACCOUNT_LIMITS,
  };
}

const EXPORT_TABLES = ['books', 'book_sources', 'reading_snapshots', 'reading_events', 'reading_heads', 'analysis_jobs', 'graph_versions'] as const;
const ExportCursorSchema = z.object({ table: z.number().int().min(0).max(EXPORT_TABLES.length - 1), last: z.uuid().nullable(), before: z.iso.datetime() });

/** Every response stays under the hosted response cap; the browser assembles the ZIP. */
export async function exportAccount(user: AccountUser, cursor?: string) {
  let position = { table: 0, last: null as string | null, before: new Date().toISOString() };
  if (cursor) {
    try {
      if (!/^[A-Za-z0-9_-]{1,500}$/.test(cursor)) throw new Error('Invalid encoding');
      position = ExportCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    } catch { throw new RequestBodyError('Invalid export cursor.', 400); }
  }
  const tableIndex = position.table;
  const table = EXPORT_TABLES[tableIndex];
  const limit = ['reading_snapshots', 'reading_events'].includes(table) ? 1 : 10;
  const order = table === 'reading_heads' ? 'source_id' : 'id';
  const select = table === 'analysis_jobs' ? 'id,book_id,source_id,status,created_at' : '*';
  const after = position.last ? `&${order}=gt.${position.last}` : '';
  const cutoff = table === 'reading_heads' ? '' : `&created_at=lte.${encodeURIComponent(position.before)}`;
  const records = await backend<Record<string, unknown>[]>(`/rest/v1/${table}?owner_id=eq.${user.id}&select=${select}&order=${order}&limit=${limit}${after}${cutoff}`, user.token);
  const nextPosition = records.length === limit ? { ...position, last: z.uuid().parse(records.at(-1)?.[order]) }
    : tableIndex + 1 < EXPORT_TABLES.length ? { ...position, table: tableIndex + 1, last: null } : null;
  const nextCursor = nextPosition ? Buffer.from(JSON.stringify(nextPosition)).toString('base64url') : null;
  return {
    schema: 'eazo-account-export-v1', exportedAt: position.before, account: { id: user.id, email: user.email },
    table, records, nextCursor, complete: nextCursor === null,
  };
}

export type ExportFileInput = { kind: 'source' | 'original' | 'manifest' | 'graph' | 'hierarchy'; id: string };
/** Only exact source paths or the three published graph objects are exportable. */
export async function exportAccountFile(user: AccountUser, input: ExportFileInput) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id)) throw new RequestBodyError('Invalid export file.', 400);
  let path: string | null;
  let bucket: string;
  if (input.kind === 'source' || input.kind === 'original') {
    const [source] = await backend<Source[]>(`/rest/v1/book_sources?id=eq.${input.id}&owner_id=eq.${user.id}&select=source_object,original_object`, user.token);
    path = source ? input.kind === 'source' ? source.source_object : source.original_object : null;
    bucket = 'eazo-sources';
  } else {
    if (!['manifest', 'graph', 'hierarchy'].includes(input.kind)) throw new RequestBodyError('Invalid export file kind.', 400);
    const [graph] = await backend<{ manifest_object: string }[]>(`/rest/v1/graph_versions?id=eq.${input.id}&owner_id=eq.${user.id}&select=manifest_object`, user.token);
    path = graph?.manifest_object.replace(/manifest\.json$/, `${input.kind}.json`) ?? null;
    bucket = 'eazo-analysis';
  }
  if (!path || !path.startsWith(`${user.id}/`)) throw new RequestBodyError('Export file not found.', 404);
  const signed = await backend<{ signedURL: string }>(`/storage/v1/object/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, user.token, {
    method: 'POST', body: JSON.stringify({ expiresIn: 60 }),
  });
  return { url: cloudConfig().url + '/storage/v1' + signed.signedURL, path, bucket };
}

type StorageEntry = { id: string | null; name: string };
/** Uses the Storage API to remove bytes, rather than deleting only object metadata with SQL. */
async function emptyAccountFolder(bucket: string, prefix: string, key: string): Promise<void> {
  for (;;) {
    const page = await backend<StorageEntry[]>(`/storage/v1/object/list/${bucket}`, key, {
      method: 'POST', body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!page.length) return;
    const files: string[] = [];
    for (const entry of page) {
      if (!entry.name || entry.name.includes('/') || entry.name === '.' || entry.name === '..') throw new Error('Invalid storage entry.');
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) await emptyAccountFolder(bucket, path, key);
      else files.push(path);
    }
    if (files.length) await backend(`/storage/v1/object/${bucket}`, key, { method: 'DELETE', body: JSON.stringify({ prefixes: files }) });
  }
}

/** Retryable: leave the auth identity and deletion marker until all storage and rows are gone. */
export async function deleteAccount(user: AccountUser): Promise<void> {
  const key = serviceKey();
  await backend('/rest/v1/rpc/eazo_begin_account_deletion', key, { method: 'POST', body: JSON.stringify({ p_owner: user.id }) });
  await emptyAccountFolder('eazo-sources', user.id, key);
  await emptyAccountFolder('eazo-analysis', user.id, key);
  await backend('/rest/v1/rpc/eazo_delete_account_rows', key, { method: 'POST', body: JSON.stringify({ p_owner: user.id }) });
  await backend(`/auth/v1/admin/users/${user.id}`, key, { method: 'DELETE' });
}
