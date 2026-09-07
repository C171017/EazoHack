import type { ReactNode } from 'react';
import styles from './reader-notice-layer.module.css';

/** Background UI must never participate in reader layout. See docs/reading-layout-stability.md. */
export function ReaderNoticeLayer({ children }: { children: ReactNode }) {
  return <aside className={styles.layer} aria-label="Reading notices" data-reader-notice-layer>
    <div className={styles.surface}>{children}</div>
  </aside>;
}
