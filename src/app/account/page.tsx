import { redirect } from 'next/navigation';
import AccountPanel from '@/features/cloud/account-panel';
import { cloudUser } from '@/server/cloud/backend';
import { RequestBodyError } from '@/server/http';

export default async function AccountPage() {
  let user;
  try { user = await cloudUser({ refresh: false }); }
  catch (error) {
    if (!(error instanceof RequestBodyError) || error.status !== 401) throw error;
  }
  if (!user) redirect('/?book=plato-republic&library=1');
  return <AccountPanel session={{ id: user.id, email: user.email }} />;
}
