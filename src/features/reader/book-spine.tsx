import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { fallbackEmblem, type BookEmblem } from '@/shared/book-emblem';
import { spineAppearance } from './bookshelf-model';
import styles from './book-library.module.css';

export function BookSpine({ id, title, emblem, variant, current, disabled, note, onClick }: {
  id: string; title: string; emblem?: BookEmblem; variant?: number; current?: boolean;
  disabled?: boolean; note?: string; onClick: () => void;
}) {
  const look = spineAppearance(id, variant);
  const mark = emblem ?? fallbackEmblem(id);
  const titleElement = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = titleElement.current;
    if (!element) return;
    // The enclosing native dialog opens after layout; measure again once visible.
    const fit = () => {
      if (!element.clientHeight || !element.clientWidth) return;
      for (let size = 21; size >= 9; size--) {
        element.style.fontSize = `${size}px`;
        if (element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1) break;
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [title]);
  return <button type="button" className={styles.book} data-variant={look.variant} data-current={current || undefined}
    style={{ '--book-height': `${look.height}px`, '--book-width': `${look.width}px`, '--book-tilt': `${look.tilt}deg` } as CSSProperties}
    disabled={disabled} onClick={onClick} aria-label={`Open ${title}${current ? ', currently reading' : ''}`} title={`${title}${note ? ` · ${note}` : ''}`}>
    <span className={styles.spine}>
      <svg className={styles.binding} viewBox="0 0 80 340" preserveAspectRatio="none" aria-hidden="true">
        <path className={styles.outline} d="M8 3Q37 1 72 4Q77 4 77 9L77 330Q77 335 71 336L8 337Q3 336 3 331L3 10Q3 4 8 3Z"/>
        <path className={styles.seam} d="M9 7Q7 151 9 332 M72 8Q74 162 71 331 M10 8Q38 6 69 9 M10 330Q40 332 69 329"/>
        {look.variant === 0 && <path d="M9 24H71 M9 28H71 M9 301H71 M9 306H71 M16 84H64 M16 270H64"/>}
        {look.variant === 1 && <path d="M14 19H66V317H14Z M19 25H61 M19 311H61 M20 79H60 M20 272H60"/>}
        {look.variant === 2 && <path d="M9 19H71 M9 23H71 M9 29H71 M9 307H71 M9 313H71 M9 317H71 M18 91H62 M18 259H62"/>}
        {look.variant === 3 && <path d="M12 10V326 M68 12V326 M18 85Q40 92 62 85 M18 268Q40 261 62 268 M27 299 40 291 53 299 40 307Z"/>}
        {look.variant === 4 && <path d="M9 21H71 M9 25H71 M9 310H71 M9 314H71 M19 87V81H61V87 M19 266V272H61V266 M35 296H45"/>}
        {look.variant === 5 && <path d="M9 20H71 M9 315H71 M17 81H63V274H17Z M21 86H59 M21 269H59 M34 300 40 294 46 300 40 306Z"/>}
      </svg>
      <svg className={styles.emblem} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mark.paths.map((d, index) => <path key={index} d={d}/>)}
      </svg>
      <span ref={titleElement} className={styles.spineTitle} data-cjk={/[\u3000-\u9fff]/.test(title) || undefined}>{title}</span>
      {current && <svg className={styles.bookmark} viewBox="0 0 14 35" aria-hidden="true"><path d="M2 1H12V32L7 27 2 32Z"/></svg>}
    </span>
    <span className={styles.bookCaption} aria-hidden="true">{current ? 'Continue reading' : 'Open book'} <span>↗</span></span>
  </button>;
}
