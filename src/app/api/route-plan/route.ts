import { readJson, requestError } from "../../../server/http";
import { createRoutePlan, RoutingNotConfiguredError } from "../../../server/routing";

export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    const plan = createRoutePlan(input);
    return Response.json({ plan, provider: plan.trigger.mode === "mock_manual" ? "mock" : "vertex_ai" });
  } catch (error) {
    if (error instanceof RoutingNotConfiguredError) {
      return Response.json({ provider: "not_configured", error: { code: "not_configured", message: error.message, retryable: false } }, { status: 503 });
    }
    return requestError(error);
  }
}
