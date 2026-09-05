'use client';
import { useEffect, useRef, useState } from 'react';
import { ZOOM_POLICY, type MapLink } from '../../shared/zoom-hierarchy';

export type AnimatedLink = { link: MapLink; opacity: number };

export function edgeTransitionPlan(previous: AnimatedLink[], links: MapLink[]) {
  const before = new Map(previous.map(entry => [entry.link.id, entry]));
  const after = new Set(links.map(link => link.id));
  return [
    ...links.map(link => ({ link, from: before.get(link.id)?.opacity ?? 0, to: 1 })),
    ...previous.filter(entry => !after.has(entry.link.id) && entry.opacity > 0)
      .sort((a, b) => b.opacity - a.opacity)
      .slice(0, ZOOM_POLICY.edges)
      .map(entry => ({ link: entry.link, from: entry.opacity, to: 0 })),
  ];
}

type Endpoint = { x: number; y: number; opacity: number };
export function edgeVisibility(opacity: number, a: Endpoint, b: Endpoint) {
  // Siblings start at the same parent. Fade short edges and their arrowheads
  // together rather than drawing a pile of markers at that shared position.
  const t = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 24);
  return opacity * Math.min(a.opacity, b.opacity) * t * t * (3 - 2 * t);
}

export function useEdgeTransition(links: MapLink[] | undefined) {
  const [animated, setAnimated] = useState<AnimatedLink[]>([]);
  const latest = useRef(animated), frame = useRef<number | null>(null);
  useEffect(() => {
    // Undefined means a request is pending (or failed), not an empty graph.
    // Keep the current fade running; endpoint visibility retires old edges.
    if (!links) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const plan = edgeTransitionPlan(latest.current, links);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let start: number | undefined;
    const tick = (now: number) => {
      start ??= now;
      const t = reduced ? 1 : Math.min(1, (now - start) / ZOOM_POLICY.duration);
      const ease = t * t * (3 - 2 * t);
      const next = plan.filter(entry => t < 1 || entry.to > 0).map(entry => ({
        link: entry.link, opacity: entry.from + (entry.to - entry.from) * ease,
      }));
      latest.current = next;
      setAnimated(next);
      frame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  }, [links]);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  return animated;
}
