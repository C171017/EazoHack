import styles from './book-library.module.css';

/** Shares the reader-opening scene's paper, ink, scale, and moving rule. */
export function ShelfLoading() {
  return <div className={`${styles.openingScene} ${styles.shelfLoading}`} role="status" aria-label="Opening your shelf">
    <svg className={styles.openingDrawing} viewBox="0 0 240 180" fill="none" aria-hidden="true">
      <ellipse className={styles.openingShadow} cx="120" cy="148" rx="72" ry="5"/>
      <g className={styles.shelvingBook}>
        <path d="M67 130V61Q67 58 70 58H87Q90 58 90 61V130Z"/>
        <path className={styles.openingDetails} d="M72 60V128M77 69H85M77 118H85"/>
      </g>
      <g className={styles.shelvingBook}>
        <path d="M94 130V45Q94 42 97 42H118Q121 42 121 45V130Z"/>
        <path className={styles.openingDetails} d="M99 44V128M104 53H115M104 58H115M104 118H115"/>
      </g>
      <g className={styles.shelvingBook}>
        <path d="M125 130V55Q125 52 128 52H141Q144 52 144 55V130Z"/>
        <path className={styles.openingDetails} d="M130 54V128M134 63H140M134 118H140"/>
      </g>
      <g className={styles.shelvingBook}>
        <path d="M159 130L146 65Q145 62 148 61L162 58Q165 57 166 61L180 126Z"/>
        <path className={styles.openingDetails} d="M151 63L164 128M154 72L163 70M163 119L173 117"/>
      </g>
      <path d="M46 132H194L190 138H50Z"/>
      <path className={styles.openingDetails} d="M54 141H186"/>
      <path className={styles.openingRule} d="M86 164H154"/>
      <path className={styles.openingSweep} pathLength="100" d="M86 164H154"/>
    </svg>
  </div>;
}
