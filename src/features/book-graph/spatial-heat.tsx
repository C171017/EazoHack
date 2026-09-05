'use client';
import { useEffect, useRef, useState } from 'react';
import type { MapView } from '../../shared/schemas';
import type { HeatVolume } from './heat-field';
import type { Size } from './map-framing';
import { createHeatRenderer } from './heat-renderer';

export function SpatialHeat({ field, view, size, readingProgress }: { field: HeatVolume; view: MapView; size: Size; readingProgress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<ReturnType<typeof createHeatRenderer> | null>(null);
  const latest = useRef({ field, view, size, readingProgress });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = { field, view, size, readingProgress }; }, [field, view, size, readingProgress]);
  useEffect(() => {
    const element = canvas.current!;
    let frame = 0;
    function initialize() {
      try {
        renderer.current = createHeatRenderer(element); setError(null);
        const args = latest.current; renderer.current.draw(args.field, args.view, args.size, args.readingProgress);
      } catch { setError('3D heat is unavailable in this browser. Footprint counts and saved results are still available.'); }
    }
    const lost = (event: Event) => { event.preventDefault(); renderer.current = null; setError('Restoring the 3D heat display…'); };
    const restored = () => { frame = requestAnimationFrame(initialize); };
    frame = requestAnimationFrame(initialize);
    element.addEventListener('webglcontextlost', lost); element.addEventListener('webglcontextrestored', restored);
    return () => { cancelAnimationFrame(frame); renderer.current?.destroy(); renderer.current = null;
      element.removeEventListener('webglcontextlost', lost); element.removeEventListener('webglcontextrestored', restored); };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => renderer.current?.draw(field, view, size, readingProgress));
    return () => cancelAnimationFrame(frame);
  }, [field, view, size, readingProgress]);
  return <>
    <canvas ref={canvas} data-spatial-heat data-heat-sources={field.seeds.length} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    {error && <p role="status" style={{ position: 'absolute', top: 56, right: 16, maxWidth: 260, padding: 8, background: '#191d23', color: '#dde5ee', zIndex: 4 }}>{error}</p>}
  </>;
}
