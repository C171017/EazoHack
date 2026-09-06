import { redirect } from 'next/navigation';

// Keep old bookmarks and authentication callbacks working without a sign-in page.
export default async function Page({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const { auth_error } = await searchParams;
  const query = new URLSearchParams({ book: 'plato-republic', library: '1' });
  if (auth_error) query.set('auth_error', auth_error);
  redirect(`/?${query}`);
}
