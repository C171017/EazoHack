import { readJson, requestError } from "../../../server/http";
import { createMockRoutePlan, RoutingNotConfiguredError } from "../../../server/routing";

export async function POST(request: Request) {
  try {
    return Response.json({ plan: createMockRoutePlan(await readJson(request)), provider: "mock" });
  } catch (error) {
    if (error instanceof RoutingNotConfiguredError) {
      return Response.json({ provider: "not_configured", error: { code: "not_configured", message: error.message, retryable: false } }, { status: 503 });
    }
    return requestError(error);
  }
}
