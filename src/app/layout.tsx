import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Eazo · Reading workspace', description: 'A local, selection-first reading workspace scaffold.' };
export default function RootLayout({children}: Readonly<{children:React.ReactNode}>) {
  return <html lang="en"><body className="m-0 bg-paper font-sans text-ink antialiased">{children}</body></html>;
}
