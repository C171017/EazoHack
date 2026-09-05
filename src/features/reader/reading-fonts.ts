import { Allura, Literata, Ma_Shan_Zheng, Noto_Serif_SC } from 'next/font/google';

// Self-hosted by Next; only the regular faces, with no eager font preloads.
const literata = Literata({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const allura = Allura({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const songti = Noto_Serif_SC({ weight: '400', preload: false, display: 'swap' });
const brush = Ma_Shan_Zheng({ weight: '400', preload: false, display: 'swap' });

export const englishFonts = [
  { id: 'literata', label: 'Literata', family: literata.style.fontFamily },
  { id: 'allura', label: 'Allura', family: allura.style.fontFamily },
] as const;
export const chineseFonts = [
  { id: 'songti', label: '思源宋体', family: songti.style.fontFamily },
  { id: 'brush', label: '马善政楷书', family: brush.style.fontFamily },
] as const;
export type ReadingFonts = { english: 'literata' | 'allura'; chinese: 'songti' | 'brush' };
export const defaultReadingFonts: ReadingFonts = { english: 'literata', chinese: 'songti' };
export function parseReadingFonts(value: string | null): ReadingFonts {
  try {
    const saved = JSON.parse(value ?? 'null');
    return {
      english: saved?.english === 'allura' ? 'allura' : 'literata',
      chinese: saved?.chinese === 'brush' ? 'brush' : 'songti',
    };
  } catch { return defaultReadingFonts; }
}
