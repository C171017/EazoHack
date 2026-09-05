# FLUX.2 [klein] 9B image testing

Eazo supports BFL direct alongside the existing fal Z-Image Turbo adapter. Set these server-only variables in the ignored root `.env.local` and restart the development server:

```dotenv
IMAGE_PROVIDER=bfl
BFL_API_KEY=<project API key>
```

Set `IMAGE_PROVIDER=fal` to return to Z-Image Turbo using the existing `FAL_KEY`. With no switch configured, fal remains the default. Neither key uses a `NEXT_PUBLIC_` prefix. Text routes still use their existing provider.

The BFL adapter calls `https://api.bfl.ai/v1/flux-2-klein-9b` (the pinned 9B endpoint), with a 1024 × 768 JPEG, default safety tolerance 2, and a recorded random seed. It uses the same passage-illustration prompt as fal so the model comparison does not also change the prompt. The existing illustration action uses the configured provider; no extra UI steps are required.

One charged submission is followed by polling at 500 ms intervals, with a 90-second deadline covering submission, polling and image retrieval. There are no automatic submission retries. Cancellation discards late output but cannot cancel BFL billing for a submitted job. BFL requires a positive credit balance.

Polling URLs are restricted to BFL API hosts and the result endpoint. Delivery URLs are restricted to `delivery.*.bfl.ai`, carry no API key, and are downloaded server-side with redirects disabled. JSON and image byte limits apply. The resulting JPEG is embedded into the existing artifact resource, preserving source anchors, prompt, model, seed and provenance after the signed delivery URL expires.

Validation: `node --import tsx --test tests/bfl-image.test.ts tests/fal-image.test.ts tests/dispatcher.test.ts`. These are network-stubbed tests; a funded-account generation is still required to verify live provider access and image quality.

Official references:

- https://docs.bfl.ai/quick_start/generating_images
- https://docs.bfl.ai/flux_2/flux2_text_to_image
- https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-[klein]-9b
