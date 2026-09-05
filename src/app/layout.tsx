import Script from 'next/script';
import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Eazo · Reading workspace', description: 'A local, selection-first reading workspace scaffold.' };
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body className="m-0 bg-paper font-sans text-ink antialiased">{children}{process.env.NODE_ENV === "development" && <Script src="/api/dev/models?asset=panel" />}</body></html>;
}
