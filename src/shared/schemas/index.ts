import { z } from "zod";

const Id = z.string().min(1).max(160);
const Text = z.string().min(1).max(20_000);
const ShortText = z.string().min(1).max(500);
const IsoDate = z.string().datetime();
const UniqueIds = z.array(Id).max(500).refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs");
export const RouteKindSchema = z.enum(["interactive_ui", "generated_image", "concept_diagram", "source_discovery"]);
export type RouteKind = z.infer<typeof RouteKindSchema>;
export const ROUTE_KINDS = RouteKindSchema.options;

const RectangleSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict().refine((r) => r.x + r.width <= 1 && r.y + r.height <= 1, "Rectangle exceeds page");
export const LocatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("txt"), startOffset: z.number().int().nonnegative(), endOffset: z.number().int().positive(), paragraphId: Id.optional() }).strict(),
  z.object({ kind: z.literal("pdf"), pageIndex: z.number().int().nonnegative(), printedPageLabel: ShortText.optional(), startOffset: z.number().int().nonnegative(), endOffset: z.number().int().positive(), rects: z.array(RectangleSchema).max(200).optional() }).strict(),
]).refine((value) => value.endOffset > value.startOffset, "Offsets must form a nonempty half-open range");

export const BookSchema = z.object({ id: Id, fileHash: Text, title: ShortText, format: z.enum(["txt", "pdf"]), extractionVersion: Id, pageCount: z.number().int().positive().optional(), createdAt: IsoDate }).strict();
export const SourceAnchorSchema = z.object({ id: Id, bookId: Id, fileHash: Text, extractionVersion: Id, locators: z.array(LocatorSchema).min(1).max(100), quote: Text, prefix: z.string().max(2000), suffix: z.string().max(2000), resolution: z.enum(["exact", "page_only", "unresolved"]) }).strict().refine((a) => a.resolution !== "page_only" || a.locators.every((l) => l.kind === "pdf"), "Text anchors cannot resolve to a PDF page");
export const SelectionSchema = z.object({ id: Id, bookId: Id, anchorIds: UniqueIds.refine((ids) => ids.length > 0, "Selection needs anchors"), selectedText: Text.refine((text) => text.trim().length > 0, "Empty selection"), contextSnapshot: z.string().max(40_000), createdAt: IsoDate }).strict();

const RouteMap = z.partialRecord(RouteKindSchema, ShortText);
const DependencyMap = z.partialRecord(RouteKindSchema, z.array(RouteKindSchema).max(4));
export const RoutePlanSchema = z.object({
  id: Id, selectionId: Id, routes: z.array(RouteKindSchema).min(1).max(4), reasonByRoute: RouteMap, dependsOn: DependencyMap,
  trigger: z.object({ mode: z.literal("mock_manual"), requestedRoutes: z.array(RouteKindSchema).min(1).max(4), requestedAt: IsoDate }).strict(), routerVersion: Id,
}).strict().superRefine((plan, ctx) => {
  const selected = new Set(plan.routes);
  if (selected.size !== plan.routes.length) ctx.addIssue({ code: "custom", message: "Routes must be unique", path: ["routes"] });
  if (new Set(plan.trigger.requestedRoutes).size !== plan.trigger.requestedRoutes.length || plan.trigger.requestedRoutes.length !== selected.size || plan.trigger.requestedRoutes.some((route) => !selected.has(route))) ctx.addIssue({ code: "custom", message: "Mock plan routes must match its explicit trigger snapshot", path: ["trigger", "requestedRoutes"] });
  for (const route of plan.routes) if (!plan.reasonByRoute[route]) ctx.addIssue({ code: "custom", message: "Each route needs a reason", path: ["reasonByRoute", route] });
  for (const route of Object.keys(plan.reasonByRoute) as RouteKind[]) if (!selected.has(route)) ctx.addIssue({ code: "custom", message: "Reason refers to an unselected route" });
  for (const [route, deps] of Object.entries(plan.dependsOn)) {
    if (!selected.has(route as RouteKind) || deps.some((dep) => !selected.has(dep)) || new Set(deps).size !== deps.length) ctx.addIssue({ code: "custom", message: "Dependencies must be unique selected routes", path: ["dependsOn", route] });
  }
  const visiting = new Set<RouteKind>(); const visited = new Set<RouteKind>();
  const visit = (route: RouteKind): boolean => {
    if (visiting.has(route)) return false;
    if (visited.has(route)) return true;
    visiting.add(route);
    for (const dep of plan.dependsOn[route] ?? []) if (!visit(dep)) return false;
    visiting.delete(route); visited.add(route); return true;
  };
  if (!plan.routes.every(visit)) ctx.addIssue({ code: "custom", message: "Route dependencies contain a cycle", path: ["dependsOn"] });
});
export const RunErrorSchema = z.object({ code: z.enum(["not_configured", "invalid_input", "invalid_output", "provider_failed", "dependency_failed", "cancelled"]), message: ShortText, retryable: z.boolean() }).strict();
export const RouteRunSchema = z.object({ id: Id, planId: Id, route: RouteKindSchema, status: z.enum(["pending", "running", "complete", "failed", "cancelled"]), dependsOn: z.array(RouteKindSchema).max(4), error: RunErrorSchema.optional(), artifactIds: UniqueIds }).strict();

const ExplanationCard = z.object({ component: z.literal("ExplanationCard"), props: z.object({ title: ShortText, body: Text }).strict() }).strict();
const ParameterSlider = z.object({ component: z.literal("ParameterSlider"), props: z.object({ label: ShortText, min: z.number().finite(), max: z.number().finite(), step: z.number().positive().finite(), value: z.number().finite(), unit: z.string().max(30) }).strict().refine((p) => p.max > p.min && p.value >= p.min && p.value <= p.max && p.step <= p.max - p.min, "Invalid slider bounds") }).strict();
const ComparisonTable = z.object({ component: z.literal("ComparisonTable"), props: z.object({ title: ShortText, columns: z.array(ShortText).min(1).max(5), rows: z.array(z.array(ShortText).min(1).max(5)).max(20) }).strict().refine((p) => p.rows.every((row) => row.length === p.columns.length), "Table row length mismatch") }).strict();
const StepSequence = z.object({ component: z.literal("StepSequence"), props: z.object({ title: ShortText, steps: z.array(ShortText).min(1).max(12) }).strict() }).strict();
const SimplePlot = z.object({ component: z.literal("SimplePlot"), props: z.object({ title: ShortText, xLabel: ShortText, yLabel: ShortText, points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() }).strict()).min(1).max(100) }).strict() }).strict();
export const InteractiveUiConfigSchema = z.object({ schemaVersion: z.literal("1"), components: z.array(z.discriminatedUnion("component", [ExplanationCard, ParameterSlider, ComparisonTable, StepSequence, SimplePlot])).min(1).max(20), assumptions: z.array(ShortText).max(20), ruleSources: z.array(ShortText).max(20), validationStatus: z.enum(["mock_unverified", "unverified", "reviewed"]) }).strict();

const DiagramNodeSchema = z.object({ id: Id, label: ShortText, anchorIds: UniqueIds }).strict();
const DiagramEdgeSchema = z.object({ id: Id, source: Id, target: Id, label: ShortText, anchorIds: UniqueIds }).strict();
export const ConceptDiagramSchema = z.object({ schemaVersion: z.literal("1"), nodes: z.array(DiagramNodeSchema).min(1).max(50), edges: z.array(DiagramEdgeSchema).max(100), groups: z.array(z.object({ id: Id, label: ShortText, nodeIds: UniqueIds }).strict()).max(20), layoutHint: z.enum(["left_to_right", "top_to_bottom"]), legend: ShortText }).strict().superRefine((diagram, ctx) => {
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const allIds = [...diagram.nodes, ...diagram.edges, ...diagram.groups].map((item) => item.id);
  if (new Set(allIds).size !== allIds.length) ctx.addIssue({ code: "custom", message: "Diagram IDs must be unique" });
  if (diagram.edges.some((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target))) ctx.addIssue({ code: "custom", message: "Diagram edge endpoint missing" });
  if (diagram.groups.some((g) => g.nodeIds.some((id) => !nodeIds.has(id)))) ctx.addIssue({ code: "custom", message: "Diagram group node missing" });
});
const ReferenceBase = { id: Id, title: ShortText, excerpt: z.string().max(4000).optional(), supportRelation: z.enum(["supports", "contradicts", "context", "unassessed"]), verificationStatus: z.enum(["unverified", "verified", "mock"]), retrievedAt: IsoDate };
export const ReferenceSchema = z.discriminatedUnion("scope", [
  z.object({ ...ReferenceBase, scope: z.literal("book"), anchorId: Id }).strict(),
  z.object({ ...ReferenceBase, scope: z.literal("external"), url: z.string().url().refine((url) => /^https?:\/\//.test(url), "Only HTTP sources are allowed") }).strict(),
]);
export const GeneratedImageSchema = z.object({ status: z.literal("placeholder"), resource: z.null(), prompt: Text, caption: Text }).strict();
export const SourceDiscoverySchema = z.object({ status: z.enum(["no_results", "results"]), scope: z.enum(["undecided", "book", "external", "both"]), query: Text, references: z.array(ReferenceSchema).max(30), summary: Text }).strict().superRefine((value, ctx) => {
  if ((value.status === "no_results" && value.references.length > 0) || (value.status === "results" && value.references.length === 0)) ctx.addIssue({ code: "custom", message: "Discovery status must match references" });
  if (value.scope === "undecided" && value.references.length > 0) ctx.addIssue({ code: "custom", message: "Unresolved scope cannot return references" });
  if (value.scope === "book" && value.references.some((ref) => ref.scope !== "book")) ctx.addIssue({ code: "custom", message: "External source exceeds book scope" });
  if (value.scope === "external" && value.references.some((ref) => ref.scope !== "external")) ctx.addIssue({ code: "custom", message: "Book source exceeds external scope" });
});
const ArtifactBase = { id: Id, bookId: Id, selectionId: Id, routeRunId: Id, nodeIds: UniqueIds, anchorIds: UniqueIds.refine((ids) => ids.length > 0, "Artifact needs source anchors"), graphVersion: Id.optional(), provider: z.enum(["mock", "not_configured"]), schemaVersion: z.literal("1"), createdAt: IsoDate, savedAt: IsoDate.nullable(), provenance: z.object({ provider: z.literal("mock"), label: ShortText }).strict() };
export const ArtifactSchema = z.discriminatedUnion("kind", [
  z.object({ ...ArtifactBase, kind: z.literal("interactive_ui"), payload: InteractiveUiConfigSchema }).strict(),
  z.object({ ...ArtifactBase, kind: z.literal("generated_image"), payload: GeneratedImageSchema }).strict(),
  z.object({ ...ArtifactBase, kind: z.literal("concept_diagram"), payload: ConceptDiagramSchema }).strict(),
  z.object({ ...ArtifactBase, kind: z.literal("source_discovery"), payload: SourceDiscoverySchema }).strict(),
]).superRefine((artifact, ctx) => {
  const allowed = new Set(artifact.anchorIds);
  if (artifact.kind === "concept_diagram" && [...artifact.payload.nodes, ...artifact.payload.edges].some((item) => item.anchorIds.some((id) => !allowed.has(id)))) ctx.addIssue({ code: "custom", message: "Diagram references anchors outside the artifact selection", path: ["payload"] });
});

export const GraphSchema = z.object({ id: Id, bookId: Id, version: Id, anchorIds: UniqueIds, nodes: z.array(z.object({ id: Id, label: ShortText, summary: Text, anchorIds: UniqueIds.refine((ids) => ids.length > 0, "Concept needs evidence"), position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict() }).strict()).max(1000), edges: z.array(z.object({ id: Id, source: Id, target: Id, type: ShortText, evidenceAnchorIds: UniqueIds, rationale: Text, provenance: z.enum(["book_supported", "model_inferred", "mock"]) }).strict()).max(3000) }).strict().superRefine((graph, ctx) => {
  const nodes = new Set(graph.nodes.map((n) => n.id)); const anchors = new Set(graph.anchorIds);
  const ids = [...graph.nodes, ...graph.edges].map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Graph IDs must be unique" });
  if (graph.nodes.some((n) => n.anchorIds.some((id) => !anchors.has(id))) || graph.edges.some((e) => e.evidenceAnchorIds.some((id) => !anchors.has(id)))) ctx.addIssue({ code: "custom", message: "Graph references unknown anchors" });
  if (graph.edges.some((e) => !nodes.has(e.source) || !nodes.has(e.target))) ctx.addIssue({ code: "custom", message: "Graph references unknown nodes" });
  if (graph.edges.some((e) => e.provenance === "book_supported" && e.evidenceAnchorIds.length === 0)) ctx.addIssue({ code: "custom", message: "Book-supported relations need evidence" });
});

export const ChunkSchema = z.object({ id: Id, bookId: Id, anchorIds: UniqueIds.refine((ids) => ids.length > 0, "Chunk needs source anchors"), textHash: Text, status: z.enum(["pending", "running", "complete", "failed"]), error: RunErrorSchema.optional() }).strict();
export const AnalysisRunSchema = z.object({ id: Id, bookId: Id, chunkIds: UniqueIds, completedChunkIds: UniqueIds, status: z.enum(["pending", "running", "complete", "failed", "cancelled"]), modelLabel: ShortText, promptVersion: Id }).strict().superRefine((run, ctx) => {
  const chunks = new Set(run.chunkIds);
  if (run.completedChunkIds.some((id) => !chunks.has(id))) ctx.addIssue({ code: "custom", message: "Completed chunks must belong to the analysis run" });
  if (run.status === "complete" && run.completedChunkIds.length !== run.chunkIds.length) ctx.addIssue({ code: "custom", message: "Complete analysis requires full declared chunk coverage" });
});
export const ViewportSchema = z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive().finite() }).strict();
export const BookmarkSchema = z.object({ id: Id, bookId: Id, graphVersion: Id, viewport: ViewportSchema, selectedNodeId: Id.optional(), readerAnchorId: Id.optional(), label: ShortText }).strict();
// Raw events only. No activity score, event vocabulary, or ranking policy is chosen here.
export const ActivityEventSchema = z.object({ id: Id, bookId: Id, nodeId: Id.optional(), anchorId: Id.optional(), type: ShortText, timestamp: IsoDate }).strict();

export type Book = z.infer<typeof BookSchema>;
export type SourceAnchor = z.infer<typeof SourceAnchorSchema>;
export type Selection = z.infer<typeof SelectionSchema>;
export type RoutePlan = z.infer<typeof RoutePlanSchema>;
export type RouteRun = z.infer<typeof RouteRunSchema>;
export type RunError = z.infer<typeof RunErrorSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type InteractiveUiConfig = z.infer<typeof InteractiveUiConfigSchema>;
export type ConceptDiagram = z.infer<typeof ConceptDiagramSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type Graph = z.infer<typeof GraphSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type AnalysisRun = z.infer<typeof AnalysisRunSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;
export type Bookmark = z.infer<typeof BookmarkSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
