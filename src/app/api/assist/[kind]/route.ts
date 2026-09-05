import { DispatchRequestSchema, dispatchRoutePlan } from "../../../../server/dispatcher";
import { readJson, requestError } from "../../../../server/http";

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await context.params;
    const input = DispatchRequestSchema.parse(await readJson(request));
    if (kind !== "all" && (input.plan.routes.length !== 1 || input.plan.routes[0] !== kind)) {
      return Response.json({ error: { code: "invalid_route", message: "Use a matching single route, or /all for a combined fixture plan." } }, { status: 400 });
    }
    return Response.json(await dispatchRoutePlan(input, { signal: request.signal }));
  } catch (error) {
    return requestError(error);
  }
}
