import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from '../persistence';
import { cloudRequest } from './request';

export const IMAGE_REF_PREFIX = 'eazo-image:';
export const IMAGE_PLACEHOLDER = 'data:image/png;base64,AA==';
const hashPattern = /^[a-f0-9]{64}$/;

/** Visit images in both visible aids and the immutable generation history used by heatmaps. */
export function mapReadingImages(value: unknown, map: (url: string) => string): unknown {
  if (Array.isArray(value)) return value.map(item => mapReadingImages(item, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'dataUrl' && typeof item === 'string' ? map(item) : mapReadingImages(item, map)]));
  return value;
}
export function readingImageHashes(value: unknown) {
  const hashes = new Set<string>();
  mapReadingImages(value, url => {
    if (url.startsWith(IMAGE_REF_PREFIX)) {
      const hash = url.slice(IMAGE_REF_PREFIX.length);
      if (!hashPattern.test(hash)) throw new Error('Invalid saved illustration reference.');
      hashes.add(hash);
    }
    return url;
  });
  return [...hashes];
}
export function validateReadingEnvelope(value: unknown) {
  readingImageHashes(value);
  // Image bytes are immutable, source-scoped objects. Validate the remaining full reading schema.
  return WorkspaceSnapshotSchema.parse(mapReadingImages(value, url => url.startsWith(IMAGE_REF_PREFIX) ? IMAGE_PLACEHOLDER : url));
}

export function createReadingImageTransport(owner: string, source: string) {
  const uploaded = new Map<string, string>();
  const downloaded = new Map<string, string>();
  return {
    async pack(snapshot: WorkspaceSnapshot) {
      const images = new Set<string>();
      mapReadingImages(snapshot, url => { images.add(url); return url; });
      for (const url of images) {
        if (uploaded.has(url)) continue;
        const bytes = new TextEncoder().encode(url);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
        const prepared = await cloudRequest('reading-image', { source, hash }, owner);
        if (!prepared.alreadyUploaded) {
          const response = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes, signal: AbortSignal.timeout(60_000) });
          if (!response.ok && response.status !== 409) throw new Error('Illustration upload failed. Your reading is saved on this device; retry sync.');
        }
        uploaded.set(url, IMAGE_REF_PREFIX + hash); downloaded.set(hash, url);
      }
      return mapReadingImages(snapshot, url => uploaded.get(url)!);
    },
    async unpack(value: unknown): Promise<WorkspaceSnapshot> {
      for (const hash of readingImageHashes(value)) {
        if (downloaded.has(hash)) continue;
        const descriptor = await cloudRequest(`reading-image?source=${encodeURIComponent(source)}&hash=${hash}`, undefined, owner);
        const response = await fetch(descriptor.url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error('A saved illustration could not be downloaded. Retry sync.');
        const url = await response.text();
        if (url.length > 14_000_000) throw new Error('Saved illustration is too large.');
        const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== hash) throw new Error('Saved illustration did not pass its integrity check.');
        downloaded.set(hash, url); uploaded.set(url, IMAGE_REF_PREFIX + hash);
      }
      return WorkspaceSnapshotSchema.parse(mapReadingImages(value, url => url.startsWith(IMAGE_REF_PREFIX) ? downloaded.get(url.slice(IMAGE_REF_PREFIX.length))! : url));
    },
  };
}
