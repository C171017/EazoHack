import { cookies } from 'next/headers';
import { RequestBodyError } from '../http';
export function cloudConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new RequestBodyError('Cloud library is not configured yet.', 503);
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid cloud origin');
  return {url: origin.origin, key};
}
export async function backend<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const {url,key} = cloudConfig();
  const response = await fetch(`${url}${path}`, { ...init, cache:'no-store', signal:AbortSignal.timeout(30_000),
    headers:{apikey:token === process.env.SUPABASE_SECRET_KEY ? token : key, ...(token.startsWith('sb_') ? {} : {Authorization:`Bearer ${token}`}), 'Content-Type':'application/json', ...init.headers} });
  if (!response.ok) throw new RequestBodyError(response.status === 401 ? 'Please sign in again.' : 'Cloud request failed. Please retry.', response.status === 401 ? 401 : 502);
  const text=await response.text();return text?JSON.parse(text) as T:undefined as T;
}
export function serviceKey() { const value=process.env.SUPABASE_SECRET_KEY; if(!value)throw new RequestBodyError('Cloud service is not configured.',503); return value; }
export async function cloudUser() {
  const jar=await cookies(); const token=jar.get('eazo-access')?.value;
  if(!token)throw new RequestBodyError('Sign in to your cloud library first.',401);
  const user=await backend<{id:string;email?:string}>('/auth/v1/user',token);
  return {...user,token};
}
export async function setSession(session:{access_token:string;refresh_token:string;expires_in:number}) {
  const jar=await cookies(); const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
  jar.set('eazo-access',session.access_token,{...options,maxAge:session.expires_in});
  jar.set('eazo-refresh',session.refresh_token,{...options,maxAge:60*60*24*30});
}
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin)throw new RequestBodyError('Unrecognized request origin.',403);
}
export async function guardGeneration(request:Request) {
  if(!process.env.VERCEL && !process.env.SUPABASE_URL)return;
  sameOrigin(request); const user=await cloudUser();
  const allowed=await backend<boolean>('/rest/v1/rpc/eazo_generation_quota',serviceKey(),{method:'POST',body:JSON.stringify({p_owner:user.id})});
  if(!allowed)throw new RequestBodyError('Daily generation allowance reached. Try again later.',429);
}
