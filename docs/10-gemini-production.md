# Gemini 3.8 Flash production setup

> Latest delivery · 2026-09-05: inline artifact slots are now implemented in the main TXT reader, with persistent placement, collapse state and source-only copying. Earlier statements below that the right-side passage panel awaits migration are superseded for TXT. PDF remains separate. See [implementation and verification](18-inline-reader-implementation.md).

> Product placement update · 2026-09-05: validated assistance artifacts should be persisted with an `ArtifactPlacement` and rendered at the selected passage in the left reading stream. The existing right-side passage panel is a migration target; provider behavior and validation remain unchanged. See [inline reader artifacts](17-inline-reader-artifacts.md).

The application uses `gemini-3.8-flash` through Vertex AI from server Route Handlers. Selected book text and its context are sent to Google only after the reader clicks **Explore with Gemini**. Credentials never enter the browser bundle.

## Implemented boundary

- `interactive_ui` produces a validated explanation and reading sequence.
- `concept_diagram` produces a validated, source-anchor-bound diagram.
- `generated_image` stays disabled because Gemini 3.8 Flash has text output only.
- `source_discovery` stays disabled until book/external search scope and citation verification are approved.
- The model never chooses IDs, writes HTML/JavaScript, or changes stored source text. Application code assigns IDs, binds source anchors, and rejects invalid JSON.

Generated explanations and diagrams are labeled unverified. This integration is not a substitute for content moderation, privacy disclosures, budget alerts, rate limiting, abuse controls, or a production incident policy.

## Local development

Copy `.env.example` to `.env.local`, fill only non-secret project values, then authenticate with Application Default Credentials:

```sh
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com
```

The local user needs permission to invoke Vertex AI models. Do not create or download a service-account key.

## Vercel production (keyless)

1. Link the Git repository to a Vercel project and enable Vercel OIDC in the project security settings. Team issuer mode is recommended.
2. In Google Cloud, create a Workload Identity Pool and OIDC provider that trusts the exact Vercel issuer and audience.
3. Restrict the provider subject to the exact Vercel owner, project, and `production` environment.
4. Create a dedicated runtime service account. Grant it only `roles/aiplatform.user` in this project.
5. Grant the exact production workload principal `roles/iam.workloadIdentityUser` on that service account.
6. Add the non-secret values from `.env.example` to Vercel Production environment variables, then redeploy.

Preview and development deployments should use separate subject bindings; do not give every Vercel project or environment access to the production service account.

## Release checks

- Run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.
- Verify one explanation and one concept diagram in the deployed URL.
- Confirm the returned artifact says `Vertex AI · gemini-3.8-flash` and remains bound to the selected source anchor.
- Confirm unsupported image/source routes cannot be selected.
- Set Google Cloud budgets/alerts and monitor Vertex request errors and latency before opening public traffic.
