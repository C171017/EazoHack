import { z } from 'zod';
import { backend, cloudConfig } from './backend';
import { RequestBodyError } from '../http';
import { readingImageHashes } from '@/features/cloud/reading-images';
export const ReadingImageInput = z.object({ source: z.uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) });
export async function readingImagePath(source: string, hash: string, user: { id: string; token: string }) {
  ReadingImageInput.parse({ source, hash });
  const [owned] = await backend<{ book_id: string }[]>(`/rest/v1/book_sources?id=eq.${source}&owner_id=eq.${user.id}&select=book_id`, user.token);
  if (!owned) throw new RequestBodyError('Book not found.', 404);
  return `${user.id}/${owned.book_id}/${source}/${hash}.txt`;
}
export async function signedReadingImage(path: string, token: string) {
  const result = await backend<{ signedURL: string }>(`/storage/v1/object/sign/eazo-reading/${path}`, token, { method: 'POST', body: JSON.stringify({ expiresIn: 60 }) });
  return { url: cloudConfig().url + '/storage/v1' + result.signedURL, path, bucket: 'eazo-reading' };
}
export async function verifyReadingImages(value: unknown, source: string, user: { id: string; token: string }) {
  for (const hash of readingImageHashes(value)) await signedReadingImage(await readingImagePath(source, hash, user), user.token);
}
