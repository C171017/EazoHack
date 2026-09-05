'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { chineseFonts, englishFonts, type ReadingFonts } from './reading-fonts';
import styles from './reading-menu.module.css';

export function ReadingMenu({ fonts, onChange, onUpload, onReset }: { fonts: ReadingFonts; onChange: (fonts: ReadingFonts) => void; onUpload: (file: File) => Promise<void>; onReset?: () => void }) {
  const [section, setSection] = useState<'upload' | 'font' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
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
      if (event.key === 'Escape') { setSection(null); setOpen(false); trigger.current?.focus(); }
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
      <input ref={fileInput} type="file" accept=".txt,text/plain,.pdf,application/pdf" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || busy) return;
        setBusy(true); setNotice('Opening book on this device…');
        try { await onUpload(file); setNotice('Book opened.'); setOpen(false); }
        catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open this book.'); }
        finally { setBusy(false); }
      }}/>
      <div className={styles.section} data-expanded={section === 'upload'} onPointerEnter={event => { if (event.pointerType === 'mouse') setSection('upload'); }}>
        <button type="button" className={styles.option} style={{ '--item-index': 0 } as CSSProperties} aria-expanded={section === 'upload'} aria-controls={`${panelId}-upload`} onClick={event => setSection(event.detail > 0 && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'upload' : section === 'upload' ? null : 'upload')}><span className={styles.label}>Upload <span aria-hidden="true">⌄</span></span></button>
        <div id={`${panelId}-upload`} className={styles.submenu} inert={section !== 'upload'} aria-hidden={section !== 'upload'}><div className={styles.subcontent}>
          <button type="button" className={styles.option} style={{ '--item-index': 0 } as CSSProperties} disabled={busy} onClick={() => fileInput.current?.click()}><span className={styles.label}>{busy ? 'Opening…' : 'Choose a book'}</span></button>
          <p className={styles.hint}>TXT · up to 20 MB<br/>PDF · up to 100 MB<br/>Opened on this device. Reopen the same file after a refresh to restore saved passages.</p>
          {onReset && <button type="button" className={styles.option} style={{ '--item-index': 1 } as CSSProperties} onClick={onReset}><span className={styles.label}>Open Republic</span></button>}
        </div></div>
      </div>
      <div className={styles.section} data-expanded={section === 'font'} onPointerEnter={event => { if (event.pointerType === 'mouse') setSection('font'); }}>
        <button type="button" className={styles.option} style={{ '--item-index': 1 } as CSSProperties} aria-expanded={section === 'font'} aria-controls={`${panelId}-font`} onClick={event => setSection(event.detail > 0 && window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'font' : section === 'font' ? null : 'font')}><span className={styles.label}>Font <span aria-hidden="true">⌄</span></span></button>
        <div id={`${panelId}-font`} className={styles.submenu} inert={section !== 'font'} aria-hidden={section !== 'font'}><div className={styles.subcontent}>
      {[{ key: 'english', label: 'English', options: englishFonts }, { key: 'chinese', label: '简体中文', options: chineseFonts }].map((group, groupIndex) =>
        <div role="group" aria-label={`${group.label} font`} key={group.key} className={styles.group}>
          {group.options.map((font, index) => <button key={font.id} type="button" className={styles.option}
            aria-pressed={fonts[group.key as keyof ReadingFonts] === font.id}
            onClick={() => onChange({ ...fonts, [group.key]: font.id })}
            style={{ '--item-index': groupIndex * 2 + index } as CSSProperties}>
            <span className={styles.label} style={{ fontFamily: font.family }} lang={group.key === 'chinese' ? 'zh-CN' : 'en'}>{font.label}</span>
          </button>)}
        </div>)}
        </div></div>
      </div>
      {notice && <p role="status" className={styles.hint}>{notice}</p>}
      </div>
    </div>
  </div>;
}
