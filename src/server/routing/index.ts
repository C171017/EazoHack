import { z } from "zod";
import {
  RouteKindSchema,
  RoutePlanSchema,
  SelectionSchema,
  type RouteKind,
  type RoutePlan,
} from "../../shared/schemas";

export const RoutePlanRequestSchema = z.object({
  selection: SelectionSchema,
  routes: z.array(RouteKindSchema).min(1).max(4),
  mode: z.enum(["mock", "real"]).default("mock"),
  dependsOn: z.partialRecord(RouteKindSchema, z.array(RouteKindSchema).max(4)).default({}),
}).strict();

export class RoutingNotConfiguredError extends Error {
  constructor() {
    super("Real routing is not configured. The available route selector is a mock fixture exercise.");
  }
}

/** Fixture adapter only: selected routes are explicit test input, never inferred policy. */
export function createMockRoutePlan(input: unknown): RoutePlan {
  const request = RoutePlanRequestSchema.parse(input);
  if (request.mode !== "mock") throw new RoutingNotConfiguredError();
  const plan = RoutePlanSchema.parse({
    id: crypto.randomUUID(),
    selectionId: request.selection.id,
    routes: request.routes,
    reasonByRoute: Object.fromEntries(request.routes.map((kind) => [kind, "Explicitly requested for the mock fixture exercise."])),
    dependsOn: request.dependsOn,
    trigger: { mode: "mock_manual", requestedRoutes: request.routes, requestedAt: new Date().toISOString() },
    routerVersion: "fixture-router-1",
  });
  validateDependencies(plan);
  return plan;
}

/** Check the entire DAG before starting any provider. */
export function validateDependencies(plan: RoutePlan): void {
  const active = new Set<RouteKind>();
  const complete = new Set<RouteKind>();
  if (new Set(plan.routes).size !== plan.routes.length) throw new Error("Routes must be unique.");
  for (const kind of Object.keys(plan.dependsOn) as RouteKind[]) {
    if (!plan.routes.includes(kind)) throw new Error("Dependency entries must belong to requested routes.");
  }
  function visit(kind: RouteKind) {
    if (active.has(kind)) throw new Error("Route dependencies must not contain a cycle.");
    if (complete.has(kind)) return;
    active.add(kind);
    const dependencies = plan.dependsOn[kind] ?? [];
    if (new Set(dependencies).size !== dependencies.length) throw new Error("Dependencies must be unique.");
    for (const dependency of dependencies) {
      if (!plan.routes.includes(dependency)) throw new Error("A dependency is missing from the requested routes.");
      visit(dependency);
    }
    active.delete(kind);
    complete.add(kind);
  }
  plan.routes.forEach(visit);
}
