# Local development model controls

The bottom-left **DEV · Models** control independently selects providers for the reader's numbered actions:

1. Explanation: configured Gemini model via Vertex AI, or GLM 5.3 Flash via Inco.
2. Diagram: configured Gemini model via Vertex AI, or GLM 5.3 Flash via Inco.
3. Interactive panel: configured Gemini model via Vertex AI, or GLM 5.3 Flash via Inco.
4. Illustration: FLUX.2 [klein] 9B via BFL, or Z-Image Turbo via fal.

Changes save immediately and affect the next generation. Each dispatch snapshots its choices so switching while a generation is running cannot change its provider validation or provenance. Reset defaults restores the environment configuration (currently Gemini and BFL locally). No generation is triggered by selecting a model.

The panel implementation (`.local-dev/model-panel.js`) and preferences (`.local-dev/models.json`) are Git-ignored. Small server and layout hooks stay in source control; a checkout without the optional panel file remains valid and serves an empty script in development. No ignored file is statically imported or required for builds.

The script is served through `/api/dev/models?asset=panel`, not from the public directory. Both script and settings routes return 404 outside development. Development requests require a loopback hostname, and writes require a matching Origin. Preferences are schema-validated and saved atomically. API keys remain in server environment variables; the settings endpoint exposes only configured-key booleans, model names, and selected providers.

Validation covers production rejection, host/origin checks, invalid choices, existing provider/dispatcher tests, and browser switching plus reload persistence. Browser QA restores defaults after testing. The optional local panel is intentionally not distributed through Git.
