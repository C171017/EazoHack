import { bookSeed } from '@/shared/book-emblem';

export type ShelfPlacement = { slot: number; title: string; localOnly?: boolean };
export type ShelfPosition = { slot: number; variant: number };

export function nextShelfPosition(id: string, occupied: Set<number>, requested?: number): ShelfPosition {
  let slot = Number.isSafeInteger(requested) && requested! >= 0 && requested! < 10000 ? requested! : 1;
  while (occupied.has(slot)) slot++;
  return { slot, variant: bookSeed(id) % 6 };
}

export function spineAppearance(id: string, variant?: number) {
  const seed = bookSeed(id);
  return {
    variant: variant ?? seed % 6,
    height: 270 + seed % 65,
    width: 61 + (seed >>> 5) % 18,
    tilt: ((seed >>> 10) % 7 - 3) * .65,
  };
}

export const cleanBookTitle = (title: string) => title.replace(/\.(txt|pdf)$/i, '').trim();
