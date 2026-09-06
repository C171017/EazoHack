export const englishFonts = [
  { id: 'literata', label: 'Literata', family: '"Literata", "Literata Fallback"'  },
  { id: 'allura', label: 'Allura', family: '"Allura", "Allura Fallback"'  },
] as const;
export const chineseFonts = [
  { id: 'songti', label: '思源宋体', family: '"Noto Serif SC", "Noto Serif SC Fallback"'  },
  { id: 'brush', label: '马善政楷书', family: '"Ma Shan Zheng", "Ma Shan Zheng Fallback"'  },
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
