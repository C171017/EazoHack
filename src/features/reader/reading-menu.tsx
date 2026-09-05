'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { chineseFonts, englishFonts, type ReadingFonts } from './reading-fonts';
import styles from './reading-menu.module.css';

export function ReadingMenu({ fonts, onChange }: { fonts: ReadingFonts; onChange: (fonts: ReadingFonts) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openedByHover = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div ref={root} className={styles.menu} data-open={open}
    onPointerEnter={event => {
      if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !open) {
        openedByHover.current = true;
        setOpen(true);
      }
    }}
    onPointerLeave={() => {
      if (openedByHover.current && !root.current?.contains(document.activeElement)) setOpen(false);
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <button ref={trigger} className={styles.trigger} type="button"
      aria-label={open ? 'Close reading menu' : 'Open reading menu'} aria-expanded={open} aria-controls={panelId}
      onClick={() => {
        // The first mouse click pins a hover-open menu instead of immediately closing it.
        if (openedByHover.current) { openedByHover.current = false; setOpen(true); }
        else setOpen(current => !current);
      }}>
      <span className={styles.line}/><span className={styles.line}/><span className={styles.line}/>
    </button>
    <div id={panelId} className={styles.options} inert={!open} aria-hidden={!open}>
      <div className={styles.content}>
      {[{ key: 'english', label: 'English', options: englishFonts }, { key: 'chinese', label: '简体中文', options: chineseFonts }].map((group, groupIndex) =>
        <div role="group" aria-label={`${group.label} font`} key={group.key} className={styles.group}>
          {group.options.map((font, index) => <button key={font.id} type="button" className={styles.option}
            aria-pressed={fonts[group.key as keyof ReadingFonts] === font.id}
            onClick={() => onChange({ ...fonts, [group.key]: font.id })}
            style={{ '--item-index': groupIndex * 2 + index } as CSSProperties}>
            <span className={styles.label} style={{ fontFamily: font.family }} lang={group.key === 'chinese' ? 'zh-CN' : 'en'}>{font.label}</span>
          </button>)}
        </div>)}
      </div>
    </div>
  </div>;
}
