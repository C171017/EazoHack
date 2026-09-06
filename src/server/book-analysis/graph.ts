import { GraphSchema, type Graph } from '../../shared/schemas';
import { PROMPT_VERSION, type Candidate, type CandidateEdge, type Passage, type Review, type Synthesis } from './contracts';

export function missingIdentityNodes(value: Synthesis, nodes: Candidate[]) {
  const assigned = new Set(value.identities.flatMap(i => i.nodeIds));
  return nodes.filter(n => !assigned.has(n.id));
}

// Validate all other constraints before a small, explicit model repair of omissions.
// The temporary singleton groups here are not published or used as model decisions.
export function validateSynthesisForRepair(value: Synthesis, nodes: Candidate[]) {
  validateSynthesis({ ...value, identities: [...value.identities, ...missingIdentityNodes(value, nodes).map(n => ({ label: n.identityLabel, nodeIds: [n.id] }))] }, nodes);
  return value;
}

export function validateSynthesis(value: Synthesis, nodes: Candidate[]) {
  const expected = new Set(nodes.map(n => n.id));
  for (const [kind, groups] of [['theme', value.themes], ['identity', value.identities]] as const) {
    const assignments = groups.flatMap(g => g.nodeIds);
    if (assignments.length !== nodes.length || new Set(assignments).size !== nodes.length || assignments.some(id => !expected.has(id))) {
      const missing = [...expected].filter(id => !assignments.includes(id));
      const duplicate = [...new Set(assignments.filter((id, i) => assignments.indexOf(id) !== i))];
      const unknown = assignments.filter(id => !expected.has(id));
      throw new Error(`Every occurrence must have exactly one ${kind}. Missing: ${missing.join(', ')}. Duplicated: ${duplicate.join(', ')}. Unknown: ${unknown.join(', ')}.`);
    }
  }
  const chunks = new Map(nodes.map(node => [node.id, node.chunkId]));
  const localEdges: string[] = [];
  for (const edge of value.crossEdges) {
    if (!expected.has(edge.source) || !expected.has(edge.target) || edge.source === edge.target) throw new Error('Invalid cross-edge endpoints.');
    if (chunks.get(edge.source) === chunks.get(edge.target)) localEdges.push(`${edge.source}->${edge.target}`);
  }
  if (localEdges.length) throw new Error(`Cross edges must connect different chunks. Remove ALL these same-chunk edges: ${localEdges.join(', ')}. Check chunkId for every edge. Empty crossEdges is valid. Preserve theme and identity assignments.`);
  return value;
}

export function assembleGraph(input: {
  nodes: Candidate[]; edges: CandidateEdge[]; synthesis: Synthesis; reviews: Review[];
  passages: Map<string, Passage>; text: string; fileHash: string; extractionVersion?: string; bookId: string;
  graphVersion: string; model: string; totalChunks: number;
}): Graph {
  const { synthesis, passages, text, fileHash, bookId, graphVersion, model, totalChunks } = input;
  const rejectedNodes = new Set(input.reviews.flatMap(r => r.rejectedNodes.map(n => n.id)));
  const rejectedEdges = new Set(input.reviews.flatMap(r => r.rejectedEdges.map(e => e.id)));
  const kept = input.nodes.filter(n => !rejectedNodes.has(n.id));
  if (!kept.length) throw new Error('No supported occurrences survived review.');
  const keptIds = new Set(kept.map(n => n.id));
  const edges = input.edges.filter(e => !rejectedEdges.has(e.id) && keptIds.has(e.source) && keptIds.has(e.target));
  const used = new Set([...kept.flatMap(n => n.passageIds), ...edges.flatMap(e => e.passageIds)]);
  const anchors = [...used].map(id => {
    const p = passages.get(id);
    if (!p || text.slice(p.start, p.end) !== p.text) throw new Error(`Unresolved source anchor: ${id}`);
    return { id, bookId, fileHash, extractionVersion: input.extractionVersion ?? 'txt-lf-v1', locators: [{ kind: 'txt', startOffset: p.start, endOffset: p.end }], quote: p.text, prefix: text.slice(Math.max(0, p.start - 80), p.start), suffix: text.slice(p.end, p.end + 80), resolution: 'exact' };
  });
  const themeGroups = synthesis.themes.map(t => ({ ...t, nodeIds: t.nodeIds.filter(id => keptIds.has(id)) })).filter(t => t.nodeIds.length);
  const territories = themeGroups.map((t, i) => {
    const anchorIds = [...new Set(kept.filter(n => t.nodeIds.includes(n.id)).flatMap(n => n.passageIds))];
    return { id: `theme-${i}`, label: t.label, centroidX: (i + 0.5) / themeGroups.length, anchorIds, coverage: t.nodeIds.length / kept.length, orderLocked: true, evidence: { anchorIds, rationale: `${t.rationale} Coverage is the fraction of retained occurrences, not source text. Topic order is display metadata, not an axis value.`, ruleVersion: PROMPT_VERSION, confidence: null } };
  });
  const identities = synthesis.identities.map((identity, i) => ({ id: `identity-${i}`, label: identity.label, summary: `Shared concept with separately anchored occurrences; individual claims and attribution remain distinct.`, occurrenceIds: identity.nodeIds.filter(id => keptIds.has(id)) })).filter(i => i.occurrenceIds.length);
  const nodes = kept.map(n => {
    const p = passages.get(n.passageIds[0])!;
    const themeIndex = themeGroups.findIndex(t => t.nodeIds.includes(n.id));
    return { id: n.id, identityId: identities.find(i => i.occurrenceIds.includes(n.id))!.id, kind: 'occurrence', label: n.label, summary: n.summary,
      anchorIds: n.passageIds, themeTerritoryIds: [territories[themeIndex].id], structuralLevel: null,
      position: { x: null, y: null, z: p.start / text.length },
      evidence: { anchorIds: n.passageIds, rationale: `${n.rationale} Reasoning hint: ${n.reasoningHint} Generality hint: ${n.generalityHint} X/Y await separate whole-book source review; Z derives from the first exact passage offset.`, ruleVersion: PROMPT_VERSION, confidence: null },
      sourceLabel: `${p.section} · ${n.sourceRole}${n.speaker ? ` · ${n.speaker}` : ''}`, sourceRole: n.sourceRole, speaker: n.speaker,
    };
  }).sort((a, b) => a.position.z - b.position.z || a.id.localeCompare(b.id));
  const graph = GraphSchema.parse({
    id: `${bookId}-map`, bookId, graphVersion, fileHash, extractionVersion: input.extractionVersion ?? 'txt-lf-v1', sourceLength: text.length,
    anchors, territories, identities, nodes,
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: e.type, evidenceAnchorIds: e.passageIds, rationale: e.rationale, provenance: 'model_inferred' })),
    analysis: { status: 'complete', provider: 'vertex_ai', model, promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), completedChunks: totalChunks, totalChunks, processedCharacters: text.length, reviewStatus: 'model_reviewed', rejectedNodes: rejectedNodes.size, rejectedEdges: input.edges.length - edges.length },
  });
  validateGraphSource(graph, text, fileHash, input.extractionVersion);
  return graph;
}

export function validateGraphSource(graph: Graph, text: string, fileHash: string, extractionVersion = 'txt-lf-v1') {
  if (graph.fileHash !== fileHash || graph.extractionVersion !== extractionVersion || graph.sourceLength !== text.length) throw new Error('Saved analysis belongs to a different source version.');
  for (const anchor of graph.anchors) {
    const locator = anchor.locators[0];
    if (locator.kind !== 'txt' || anchor.resolution !== 'exact' || text.slice(locator.startOffset, locator.endOffset) !== anchor.quote) throw new Error(`Saved analysis has an invalid exact quote: ${anchor.id}`);
  }
  return graph;
}
