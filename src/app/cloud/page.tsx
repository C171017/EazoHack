import { redirect } from 'next/navigation';

// Keep old bookmarks and authentication callbacks working without a sign-in page.
export default async function Page({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const { auth_error } = await searchParams;
  const query = new URLSearchParams();
  if (auth_error) query.set('auth_error', auth_error);
  redirect(auth_error ? `/?${query}` : '/');
}
