# Z-Image Turbo illustrations

Implemented locally on 2026-09-05 following the user's selection of Z-Image Turbo, with editing explicitly out of scope.

## Reader flow

Select TXT source text and click Illustration (or Command+4). The manual generated_image route calls fal on the server and inserts a collapsible illustration at the original selection. Text/diagram requests retain their Vertex provider. Mixed dispatches and explicit retries preserve each artifact's provider and source anchors. Existing persistence accepts the embedded JPEG plus model, seed and prompt version; no expiring image URL is stored.

## Configuration and cost

Set server-only FAL_KEY in ignored .env.local or the deployment environment. Use a dedicated API-scope fal key. Never use NEXT_PUBLIC_FAL_KEY. This change configures the local environment only; it does not publish or configure a hosted deployment.

Fixed endpoint: https://fal.run/fal-ai/z-image/turbo

- One 1024×768 JPEG, eight inference steps, regular acceleration.
- Safety checking enabled; prompt expansion disabled.
- sync_mode returns a data URI, avoiding a separate remote-image fetch. fal documents that these outputs are not available in request history.
- Direct request with a 90-second deadline; route duration allowance 120 seconds. No automatic resubmission; errors offer explicit retry. A timeout/disconnect cannot guarantee cancellation of upstream work or charges.
- fal's listed price is $0.005/megapixel; 1024×768 is 0.786 MP, or approximately $0.00393 per attempt before any provider billing rounding. This is a price calculation, not a verified invoice amount.

Sources: [Model API schema](https://fal.ai/models/fal-ai/z-image/turbo/api), [pricing](https://fal.ai/models/fal-ai/z-image/turbo), [authentication](https://fal.ai/docs/documentation/setting-up/authentication).

## Prompt

src/server/providers/illustration-prompt.ts owns passage-illustration-v2. It supplies the selected passage directly in a compact visual prompt: one wordless editorial painting, clear silhouettes, restrained colors, and preservation of subjects/actions/relationships. Abstract passages may use a visual metaphor. It forbids lettering, text panels, page mockups and collage. It does not add a text-model call or send the whole book or contextSnapshot. Select up to 12,000 characters; longer selections receive an explicit request to shorten them.

The first structured JSON-style prompt caused the model to draw a passage text panel. The revised scene-style prompt removed that panel in the observed second cave example. Exact spatial/semantic fidelity remains model-dependent; the cave sample did not establish diagram-level accuracy. Outputs are labeled as interpretive illustrations, not source evidence. Editing is not implemented.

## Validation

- Dedicated Eazo Illustration API-scope key created in Chrome; kept out of source and tool output; local file permissions 0600 and git-ignore verified.
- Real provider test: first attempt 18.393 seconds; revised prompt 3.684 seconds. Different prompts/random seeds and only two observations: not a latency benchmark.
- Chrome: selected London in the TXT source, clicked Illustration, observed loading then a real inline London illustration and source highlight. Existing map remained visible.
- 121 tests passed, including missing credentials/no spend, malformed/oversized/unsafe output, no automatic charged retries, timeout handling, mixed-provider retry, and image artifact persistence.
- TypeScript and ESLint passed.

The implementation is an MVP synchronous integration. Public deployment still needs the application's user authentication and shared usage limits; this local wiring does not add those services.
