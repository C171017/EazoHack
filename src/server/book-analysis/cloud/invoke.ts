import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';
import { z } from 'zod';

const env = (name: string, pattern: RegExp) => {
    const value = process.env[name] ?? '';
    if (!pattern.test(value)) throw new Error(`Missing or invalid ${name}`);
    return value;
  };
export async function bookAnalysisAccessToken() {
  const number = env('GCP_PROJECT_NUMBER', /^\d+$/);
  const pool = env('GCP_WORKLOAD_IDENTITY_POOL_ID', /^[a-z0-9-]{4,32}$/);
  const provider = env('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID', /^[a-z0-9-]{4,32}$/);
  const account = env('GCP_JOBS_INVOKER_SERVICE_ACCOUNT_EMAIL', /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/);
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken({ expirationBufferMs: 300_000 }) },
  });
  const token = (await client?.getAccessToken())?.token;
  if (!token) throw new Error('Job invocation authentication unavailable');
  return token;
}

/** Caller must verify ownership, quota and immutable source BEFORE dispatch. */
export async function invokeBookAnalysis(jobId: string) {
  z.uuid().parse(jobId);
  const project = env('GOOGLE_CLOUD_PROJECT', /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/);
  const region = env('GCP_JOBS_REGION', /^[a-z0-9-]+$/);
  const job = env('GCP_ANALYSIS_JOB_NAME', /^[a-z][a-z0-9-]+$/);
  const token = await bookAnalysisAccessToken();
  const response = await fetch(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`, {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ overrides: { containerOverrides: [{ env: [{ name: 'EAZO_ANALYSIS_JOB_ID', value: jobId }] }] } }),
  });
  if (!response.ok) throw new Error(`Job dispatch failed (${response.status})`);
  const operation = z.object({ name: z.string() }).parse(await response.json());
  return operation.name;
}
