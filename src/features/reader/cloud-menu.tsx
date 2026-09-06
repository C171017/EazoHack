'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './cloud-menu.module.css';
import { cloudRequest, announceAccountChange } from '../cloud/request';

const errors: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled. Please try again.',
  expired: 'Sign-in expired. Please try again.',
  unavailable: 'Google sign-in is unavailable right now. Please try again shortly.',
};

export function CloudMenu() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [session, setSession] = useState<{id:string;email?:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const error = query.get('auth_error');
    if (query.has('deleted')) queueMicrotask(() => setMessage(query.has('device_cache') ? 'Account deleted. Clear this site’s browser storage to remove remaining device copies.' : 'Your account and cloud library were deleted.'));
    if (error) queueMicrotask(() => setMessage(errors[error] ?? errors.unavailable));
  }, []);

  useEffect(() => {
    let active = true, generation = 0;
    const refresh = () => {
      const ticket = ++generation;
      void cloudRequest('session').then(value => {
        if (active && ticket === generation) setSession(value.id ? value : null);
      }).catch(() => { if (active && ticket === generation) setSession(null); });
    };
    const changed = () => { setSession(null); refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === 'eazo-auth-change') changed(); };
    refresh(); window.addEventListener('focus', refresh); window.addEventListener('eazo-auth-changed', changed); window.addEventListener('storage', storage);
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('eazo-auth-changed', changed); window.removeEventListener('storage', storage); };
  }, []);

  async function signOut() {
    if (!session || busy) return;
    setBusy(true); setMessage('');
    try {
      await cloudRequest('logout', {}, session.id); announceAccountChange();
      window.location.replace(new URL('/?book=plato-republic&library=1', window.location.origin).href);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sign-out did not finish. Please try again.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <div ref={root} className={styles.menu} data-open={open}
    onPointerEnter={event => { if (event.pointerType !== 'touch') setOpen(true); }}
    onPointerLeave={event => { if (event.pointerType !== 'touch') setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); trigger.current?.focus(); setOpen(false);
      }
    }}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={session ? "Cloud account" : "Cloud sign-in"} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 19H18a4.5 4.5 0 0 0 0-9h-1.26A7.5 7.5 0 1 0 7.5 19Z"/></svg>
    </button>
    <div id={panelId} className={styles.options} inert={!open} aria-hidden={!open}>
      {session ? <>
        <a className={styles.google} href="/account" aria-label="Account settings">
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5.7 18.4a6.5 6.5 0 0 1 12.6 0"/></svg>
        </a>
        <button type="button" className={styles.google} disabled={busy} onClick={() => void signOut()} aria-label="Sign out">
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/></svg>
        </button>
      </> : <a className={styles.google} href="/auth/google?next=%2F%3Fbook%3Dplato-republic%26library%3D1" aria-label="Sign in with Google">
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 12.2c0-.7-.1-1.4-.2-2.1H12v3.8h4.8a4.4 4.4 0 0 1-4.8 3.6 5.5 5.5 0 1 1 3.9-9.4l2.8-2.8A9.4 9.4 0 1 0 12 21.4c5.4 0 8.5-3.8 8.5-9.2Z"/></svg>
      </a>}
    </div>
    {message && <p className={styles.error} role="status">{message}</p>}
  </div>;
}
