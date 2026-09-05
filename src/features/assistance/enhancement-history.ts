import type { Artifact } from '@/shared/schemas';
import type { ArtifactPlacement } from '../reader/artifact-placement';
import type { WorkspaceSnapshot } from '../persistence';

export type EnhancementState = Pick<WorkspaceSnapshot, 'artifacts' | 'placements' | 'interactionState'>;
export type EnhancementHistory = { present: EnhancementState; past: string[][]; future: EnhancementState[] };
export type EnhancementAction =
  | { type: 'update'; update: (state: EnhancementState) => EnhancementState }
  | { type: 'generate'; artifacts: Artifact[]; placements: ArtifactPlacement[] }
  | { type: 'reset'; state: EnhancementState }
  | { type: 'undo' | 'redo' };
export const emptyEnhancementHistory: EnhancementHistory = {
  present: { artifacts: [], placements: [], interactionState: {} }, past: [], future: [],
};

export function enhancementHistoryReducer(history: EnhancementHistory, action: EnhancementAction): EnhancementHistory {
  const { present, past, future } = history;
  switch (action.type) {
    case 'reset': return { present: action.state, past: [], future: [] };
    case 'update': return { ...history, present: action.update(present) };
    case 'generate': {
      if (!action.artifacts.length) return history;
      const order = Math.max(-1, ...present.placements.map(p => p.order)) + 1;
      return {
        present: { ...present, artifacts: [...present.artifacts, ...action.artifacts], placements: [...present.placements, ...action.placements.map((p, i) => ({ ...p, order: order + i }))] },
        past: [...past, action.artifacts.map(a => a.id)], future: [],
      };
    }
    case 'undo': {
      const ids = past.at(-1);
      if (!ids) return history;
      const included = new Set(ids);
      const batch: EnhancementState = {
        artifacts: present.artifacts.filter(a => included.has(a.id)),
        placements: present.placements.filter(p => included.has(p.artifactId)),
        interactionState: Object.fromEntries(Object.entries(present.interactionState).filter(([id]) => included.has(id))),
      };
      return {
        present: {
          artifacts: present.artifacts.filter(a => !included.has(a.id)),
          placements: present.placements.filter(p => !included.has(p.artifactId)),
          interactionState: Object.fromEntries(Object.entries(present.interactionState).filter(([id]) => !included.has(id))),
        }, past: past.slice(0, -1), future: [...future, batch],
      };
    }
    case 'redo': {
      const batch = future.at(-1);
      if (!batch) return history;
      return {
        present: { artifacts: [...present.artifacts, ...batch.artifacts], placements: [...present.placements, ...batch.placements], interactionState: { ...present.interactionState, ...batch.interactionState } },
        past: [...past, batch.artifacts.map(a => a.id)], future: future.slice(0, -1),
      };
    }
  }
}
