/** Public examples are permanent shelf entries, separate from private uploads. */
export const SAMPLE_BOOKS = [
  { id: 'plato-republic', title: 'The Republic of Plato', byline: 'Plato · Translated by Benjamin Jowett', language: 'en', slot: 0, variant: 0 },
  { id: 'hong-lou-meng', title: '红楼梦', byline: '曹雪芹 · 一百二十回 · 简体中文', language: 'zh-Hans', slot: 1, variant: 3 },
] as const;
export const SAMPLE_SHELF_SIZE = SAMPLE_BOOKS.length;
export const sampleBook = (id: string) => SAMPLE_BOOKS.find(book => book.id === id);
