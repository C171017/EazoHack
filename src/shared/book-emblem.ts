import { z } from 'zod';

/** Model output is drawing data, never executable SVG markup. */
export const BookEmblemSchema = z.object({
  label: z.string().min(1).max(120),
  paths: z.array(z.string().min(3).max(1600).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/)).min(1).max(12),
}).strict();
export type BookEmblem = z.infer<typeof BookEmblemSchema>;

export const REPUBLIC_EMBLEM: BookEmblem = {
  label: 'A sun above a classical portico',
  paths: ['M7 23 24 14 41 23H7Z M10 39H38 M7 43H41 M13 26V36 M20 26V36 M28 26V36 M35 26V36', 'M20 9A4 4 0 0 1 28 9 M24 2V4 M15 5 17 7 M33 5 31 7'],
};

const FALLBACKS: BookEmblem[] = [
  { label: 'An open book', paths: ['M24 13C18 8 10 9 5 11V36C12 33 18 34 24 39C30 34 36 33 43 36V11C36 9 30 8 24 13V39', 'M10 17C14 16 18 17 20 19 M10 23C14 22 18 23 20 25 M29 19C32 17 36 16 39 17 M29 25C32 23 36 22 39 23'] },
  { label: 'A branch with leaves', paths: ['M13 42C22 32 27 19 29 5', 'M22 29C9 29 7 19 10 16C19 16 24 22 22 29 M26 20C25 9 32 5 38 6C39 14 33 20 26 20 M17 36C23 27 32 28 36 31C32 38 23 40 17 36'] },
  { label: 'A guiding star', paths: ['M24 4 28 19 43 24 28 29 24 44 20 29 5 24 20 19Z', 'M9 9 14 14 M34 34 39 39 M9 39 14 34 M34 14 39 9'] },
  { label: 'A rising sun', paths: ['M5 33H43 M7 38H41 M13 28A11 11 0 0 1 35 28', 'M24 5V11 M8 12 13 17 M40 12 35 17 M3 24H8 M40 24H45'] },
  { label: 'An hourglass', paths: ['M12 5H36 M12 43H36 M15 5C14 17 18 19 24 24C30 29 34 31 33 43 M33 5C34 17 30 19 24 24C18 29 14 31 15 43', 'M18 13H30 M18 37 24 30 30 37Z'] },
  { label: 'A small compass', paths: ['M24 5A19 19 0 1 1 23.99 5 M31 16 27 27 16 32 21 21Z', 'M24 8V11 M24 37V40 M8 24H11 M37 24H40'] },
];

export function bookSeed(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export const fallbackEmblem = (id: string) => FALLBACKS[bookSeed(id) % FALLBACKS.length];

/** Take distributed samples, keeping even large books under the request limit. */
export function emblemExcerpt(text: string) {
  if (text.length <= 10000) return text;
  return Array.from({ length: 5 }, (_, i) => {
    const start = Math.floor((text.length - 2000) * i / 4);
    return `[Excerpt ${i + 1} of 5]\n${text.slice(start, start + 2000)}`;
  }).join('\n\n');
}
