'use client';

import { useEffect, type CSSProperties } from 'react';
import type { RouteKind } from '@/shared/schemas';
import { ENHANCEMENTS } from '@/shared/enhancements';
import styles from './enhancement-picker.module.css';

export const enhancementOptions = [
  { id: 'explanation', label: ENHANCEMENTS.explanation.label, route: 'interactive_ui', color: ENHANCEMENTS.explanation.ink },
  { id: 'diagram', label: ENHANCEMENTS.diagram.label, route: 'concept_diagram', color: ENHANCEMENTS.diagram.ink },
  { id: 'interactive', label: ENHANCEMENTS.interactive.label, route: 'interactive_panel', color: ENHANCEMENTS.interactive.ink },
  { id: 'illustration', label: ENHANCEMENTS.illustration.label, route: 'generated_image', color: ENHANCEMENTS.illustration.ink },
] as const;

export type PickerPosition = { left: number; top: number };

export function EnhancementPicker({ position, busy, onChoose }: {
  position: PickerPosition | null;
  busy: boolean;
  onChoose: (route: RouteKind) => void;
}) {
  useEffect(() => {
    if (!position) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const option = enhancementOptions.find((_, index) => event.key === String(index + 1));
      if (!option) return;
      event.preventDefault();
      if (!event.repeat && option.route && !busy) onChoose(option.route);
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [position, busy, onChoose]);

  return <div className={styles.picker} data-open={!!position} style={position ?? undefined}
    role="group" aria-label="Reading enhancements" aria-hidden={!position} inert={!position}
    onPointerDown={event => event.preventDefault()}>
    {enhancementOptions.map((option, index) => <button key={option.id} type="button"
      className={styles.option} style={{ '--enhancement-color': option.color, '--item-index': index } as CSSProperties}
      aria-label={option.label} aria-keyshortcuts={`Meta+${index + 1}`} aria-disabled={!option.route || busy}
      onClick={() => { if (option.route && !busy) onChoose(option.route); }}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {option.id === 'explanation' && <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M7 7h7M7 10h10M7 13h5"/></>}
        {option.id === 'diagram' && <><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/></>}
        {option.id === 'interactive' && <><path d="m9 9 5 12 1.8-5.2L21 14Z"/><path d="M7 2v3M2 7h3M3 3l2 2M11 3l-1 2M3 11l2-1"/></>}
        {option.id === 'illustration' && <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".6"/><circle cx="10" cy="6.8" r=".6"/><circle cx="14" cy="6.8" r=".6"/><circle cx="17" cy="10" r=".6"/></>}
      </svg>
      <kbd className={styles.shortcut} aria-hidden="true">⌘{index + 1}</kbd>
      <span className={styles.tooltip}>{option.label} · ⌘{index + 1}{!option.route ? ' · Not connected yet' : busy ? ' · Generation in progress' : ' · Generate'}</span>
    </button>)}
  </div>;
}
