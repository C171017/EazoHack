'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MapView } from '../../shared/schemas';
import type { HeatVolume } from './heat-field';
import type { Size } from './map-framing';
import { createHeatRenderer } from './heat-renderer';

export function SpatialHeat({ field, view, size, readingProgress, transitionMs = 0 }: { transitionMs?: number; field: HeatVolume; view: MapView; size: Size; readingProgress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<ReturnType<typeof createHeatRenderer> | null>(null);
  const animation = useRef(0), paint = useRef<() => void>(() => {});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = canvas.current!;
    let frame = 0;
    function initialize() {
      try {
        renderer.current = createHeatRenderer(element); setError(null);
        paint.current();
      } catch { setError('3D heat is unavailable in this browser. Footprint counts and saved results are still available.'); }
    }
    const lost = (event: Event) => { event.preventDefault(); renderer.current = null; setError('Restoring the 3D heat display…'); };
    const restored = () => { frame = requestAnimationFrame(initialize); };
    frame = requestAnimationFrame(initialize);
    element.addEventListener('webglcontextlost', lost); element.addEventListener('webglcontextrestored', restored);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(animation.current); renderer.current?.destroy(); renderer.current = null;
      element.removeEventListener('webglcontextlost', lost); element.removeEventListener('webglcontextrestored', restored); };
  }, []);
  // Paint the heat with the same committed camera as the SVG, before paint.
  // Deferring this to another frame made the two layers visibly separate while
  // dragging, and continuous updates could keep cancelling the pending draw.
  useLayoutEffect(() => {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : transitionMs;
    const draw = () => {
      cancelAnimationFrame(animation.current);
      if (renderer.current?.draw(field, view, size, readingProgress, duration)) animation.current = requestAnimationFrame(draw);
    };
    paint.current = draw;
    draw();
    return () => cancelAnimationFrame(animation.current);
  }, [field, view, size, readingProgress, transitionMs]);
  return <>
    <canvas ref={canvas} data-spatial-heat data-heat-sources={field.seeds.length} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    {error && <p role="status" style={{ position: 'absolute', top: 56, right: 16, maxWidth: 260, padding: 8, background: '#191d23', color: '#dde5ee', zIndex: 4 }}>{error}</p>}
  </>;
}
