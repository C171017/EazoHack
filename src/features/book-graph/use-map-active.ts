'use client';

import { useSyncExternalStore } from 'react';

function subscribe(change: () => void) {
  // Match the reader's CSS breakpoint, including browser zoom and rotation.
  const desktop = window.matchMedia('(min-width: 64rem)');
  desktop.addEventListener('change', change);
  document.addEventListener('visibilitychange', change);
  window.addEventListener('pageshow', change);
  return () => {
    desktop.removeEventListener('change', change);
    document.removeEventListener('visibilitychange', change);
    window.removeEventListener('pageshow', change);
  };
}

function snapshot() {
  return document.visibilityState === 'hidden' ? 0
    : window.matchMedia('(min-width: 64rem)').matches ? 2 : 1;
}

const serverSnapshot = () => 0;

/** The camera lives in the workspace; hidden scenes can release their resources. */
export function useMapActive(mobileOpen: boolean, covered: boolean) {
  const surface = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return !covered && surface !== 0 && (surface === 2 || mobileOpen);
}
