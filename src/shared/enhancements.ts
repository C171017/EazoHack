import type { Artifact, RouteKind } from './schemas';

/** Approved jewel palette: ink on paper, brighter tint on dark surfaces. */
export const ENHANCEMENTS = {
  explanation: { label: 'Explanation', ink: '#2455B8', dark: '#78A6FF' },
  diagram: { label: 'Diagram', ink: '#167044', dark: '#62D39B' },
  interactive: { label: 'Interactive panel', ink: '#A12D87', dark: '#EF8AD7' },
  illustration: { label: 'Illustration', ink: '#945B08', dark: '#F0BB58' },
} as const;
export type EnhancementKind = keyof typeof ENHANCEMENTS;
export const ENHANCEMENT_ORDER = Object.keys(ENHANCEMENTS) as EnhancementKind[];

export function enhancementStyle(kind: EnhancementKind | null) {
  return kind ? { '--enhancement-ink': ENHANCEMENTS[kind].ink, '--enhancement-dark': ENHANCEMENTS[kind].dark } : undefined;
}

export function artifactEnhancement(artifact: Artifact): EnhancementKind | null {
  if (artifact.kind === 'interactive_panel') return 'interactive';
  if (artifact.kind === 'concept_diagram') return 'diagram';
  if (artifact.kind === 'generated_image') return 'illustration';
  if (artifact.kind === 'interactive_ui') return artifact.payload.components.some(item => item.component === 'ParameterSlider') ? 'interactive' : 'explanation';
  return null;
}

export function routeEnhancement(route: RouteKind): EnhancementKind | null {
  return route === 'interactive_panel' ? 'interactive' : route === 'interactive_ui' ? 'explanation' : route === 'concept_diagram' ? 'diagram' : route === 'generated_image' ? 'illustration' : null;
}
