# Production workload identity readiness

## Update: Production reader assistance repaired (2026-09-06)

The user explicitly approved the exact Production Gemini impersonation binding and
the Preview/Production provider allowlist. Applied both changes and verified the
provider condition. The Gemini service-account policy now contains exactly the
existing Preview member plus the approved Production member under
`roles/iam.workloadIdentityUser`. The jobs-invoker policy was not changed; the
historical proposal below includes that separate, still-unapplied change.

Live verification on `https://read.vin/?book=hong-lou-meng`: the existing failed
interactive-panel retry initially still failed while permissions propagated, then
generated “凤姐暂退歇息的动静转换”. The existing failed concept-diagram retry also
completed and rendered a passage concept diagram. Both displayed “Results added
to their original passage.” No application-code change or redeployment was needed.

The sections below preserve the earlier inspection and approval history.

Read-only inspection on 2026-09-06 confirmed:

- Project: `eazo-hack-20260905-c1710`, number `592771495287`.
- Pool/provider: `eazo-vercel/eazo-preview`, active.
- Issuer: `https://oidc.vercel.com/c171017`; allowed audience: `https://vercel.com/c171017`.
- Mapping: `google.subject=assertion.sub`.
- Provider condition allows only `owner:c171017:project:eazo-hack:environment:preview`.
- The Gemini and job-invoker service accounts each have one `roles/iam.workloadIdentityUser` binding for that exact Preview subject.
- Existing resource roles remain `roles/aiplatform.user` for `eazo-hack-gemini` at the project and `roles/run.jobsExecutorWithOverrides` for `eazo-jobs-invoker` on the single `eazo-book-analysis` job in `asia-east1`. No Production principal was present.

## Proposed change, awaiting specific user approval

Add only the exact principal below to `roles/iam.workloadIdentityUser` on the two existing service accounts. Retain their Preview members and every existing resource role:

```text
principal://iam.googleapis.com/projects/592771495287/locations/global/workloadIdentityPools/eazo-vercel/subject/owner:c171017:project:eazo-hack:environment:production
```

Accounts:

- `eazo-hack-gemini@eazo-hack-20260905-c1710.iam.gserviceaccount.com`
- `eazo-jobs-invoker@eazo-hack-20260905-c1710.iam.gserviceaccount.com`

Then update only the existing provider's attribute condition to:

```text
assertion.sub in ['owner:c171017:project:eazo-hack:environment:preview','owner:c171017:project:eazo-hack:environment:production']
```

Issuer, audience, mapping, pool, service accounts, resource roles, billing, and per-account usage quotas remain unchanged. There are no pool-wide subjects or long-lived keys. The historical provider ID `eazo-preview` can remain in both runtime environments once its exact allowlist includes Production.

## Approval block

The first proposed service-account binding was rejected before execution by automatic approval review. Its stated reason was that the public-release request did not specifically authorize granting the Production Vercel principal Workload Identity User access to the Gemini service account. The review explicitly prohibited workaround or indirect execution. No IAM/provider mutations were applied, and the other two equivalent access expansions were not attempted.

The required approval should explicitly name Production service-account impersonation on these two identities and the two-subject provider allowlist. Public reader and account-sync deployment can proceed independently; Production Google token federation remains denied until this authorization is resolved.

A renewed attempt after the conversational follow-up "do it then" was also rejected before execution; automatic review stated that this wording did not explicitly approve the exact security-sensitive binding. No other mutation was attempted. The coordinating task has presented the complete principal, role, service-account identities, and provider condition in a structured approval request and is awaiting its actual answer.

### Exact commands staged for that approval

```sh
gcloud iam service-accounts add-iam-policy-binding eazo-hack-gemini@eazo-hack-20260905-c1710.iam.gserviceaccount.com --project=eazo-hack-20260905-c1710 --role=roles/iam.workloadIdentityUser --member='principal://iam.googleapis.com/projects/592771495287/locations/global/workloadIdentityPools/eazo-vercel/subject/owner:c171017:project:eazo-hack:environment:production' --condition=None --quiet --format=json

gcloud iam service-accounts add-iam-policy-binding eazo-jobs-invoker@eazo-hack-20260905-c1710.iam.gserviceaccount.com --project=eazo-hack-20260905-c1710 --role=roles/iam.workloadIdentityUser --member='principal://iam.googleapis.com/projects/592771495287/locations/global/workloadIdentityPools/eazo-vercel/subject/owner:c171017:project:eazo-hack:environment:production' --condition=None --quiet --format=json

gcloud iam workload-identity-pools providers update-oidc eazo-preview --workload-identity-pool=eazo-vercel --location=global --project=eazo-hack-20260905-c1710 --attribute-condition="assertion.sub in ['owner:c171017:project:eazo-hack:environment:preview','owner:c171017:project:eazo-hack:environment:production']" --quiet --format=json
```

## Validation after approval

Read back both service-account policies and the provider condition. Confirm exactly the Preview and Production subjects are allowed and no new resource roles were added. The authenticated app's `/api/cloud/connection` action obtains both federated tokens without invoking a model or running an analysis job. Perform that check only after a true Vercel Production deployment; a custom domain attached to Preview does not produce a Production subject.

The existing database allowances remain 50 generation requests and 3 analysis submissions per account per day, with global job concurrency restricted by the existing submission RPC. This change does not modify those controls or add spending authorization.

The existing Cloud Run job was rechecked read-only while approval was pending: `eazo-book-analysis` remains in `asia-east1`, using `eazo-book-worker@eazo-hack-20260905-c1710.iam.gserviceaccount.com`, pipeline `worker-dd8ea048e3a052ac1249`, and image digest `sha256:c42bdb039030f793491961ab3632ab788359f1802eb8f5b5e03ee8f8f24b0b4b`. No execution was started.

Reference: [Vercel's exact-subject GCP setup](https://vercel.com/docs/oidc/gcp), [Google Workload Identity Federation principals](https://docs.cloud.google.com/iam/docs/workload-identity-federation), and [deployment-pipeline trust conditions](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
