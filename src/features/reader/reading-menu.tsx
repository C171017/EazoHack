'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { chineseFonts, englishFonts, type ReadingFonts } from './reading-fonts';
import styles from './reading-menu.module.css';
import type { ReadingLanguage } from './reading-language';

export function ReadingMenu({ language, fonts, onChange, onLibrary }: { language: ReadingLanguage; fonts: ReadingFonts; onChange: (fonts: ReadingFonts) => void; onLibrary: () => void }) {
  const [expanded, setOpen] = useState(false);
  const group = language === 'english' ? { key: 'english' as const, label: 'English', options: englishFonts }
    : language === 'chinese' ? { key: 'chinese' as const, label: '简体中文', options: chineseFonts } : null;
  const open = expanded && group !== null;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoringFocus = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        restoringFocus.current = true;
        trigger.current?.focus();
        restoringFocus.current = false;
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div ref={root} className={styles.menu} data-open={open}
    onPointerLeave={event => { if (event.pointerType !== 'touch') setOpen(false); }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <button ref={trigger} type="button" aria-label="Font" title="Font" className={styles.trigger} aria-expanded={open} aria-controls={group ? panelId : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') setOpen(true); }}
      onFocus={event => { if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) setOpen(true); }}
      onKeyDown={event => { if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}
      onPointerDown={event => { if (event.pointerType === 'touch') setOpen(current => !current); }}><svg className={styles.icon} viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5 10V5h22v5M16 5v22m-5 0h10M7 5h18"/><path d="M18 7v18" opacity=".3"/></svg></button>
    <button type="button" aria-label="Library" title="Library" className={styles.trigger} onClick={() => { setOpen(false); onLibrary(); }}><svg className={styles.icon} viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="4" y="6" width="6" height="21" rx="1"/><path d="M10 6h6v21h-6M6 11h2m4 0h2M19 8l5-2 7 19-5 2z"/></svg></button>
    {group && <div id={panelId} className={styles.options} inert={!open} aria-hidden={!open}>
      <div className={styles.content}>
        <div role="group" aria-label={`${group.label} font`} key={group.key} className={styles.group}>
          {group.options.map((font, index) => <button key={font.id} type="button" className={styles.option}
            aria-pressed={fonts[group.key as keyof ReadingFonts] === font.id}
            onClick={() => onChange({ ...fonts, [group.key]: font.id })}
            style={{ '--item-index': index } as CSSProperties}>
            <span className={styles.label} style={{ fontFamily: font.family }} lang={group.key === 'chinese' ? 'zh-CN' : 'en'}>{font.label}</span>
          </button>)}
        </div>
      </div>
    </div>}
  </div>;
}
