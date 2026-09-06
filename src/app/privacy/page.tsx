import Link from 'next/link';

export default function PrivacyPage() {
  return <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', lineHeight: 1.7 }}>
    <Link href="/">← Back to Eazo</Link>
    <h1>Your Eazo account and data</h1>
    <p>Google sign-in identifies your Eazo account using your basic profile and email address. Eazo does not request access to your Google Drive, Gmail, or Google contacts. If you lose access to Google, recover your Google account to sign in again.</p>
    <h2>What is saved</h2>
    <p>Your cloud library stores books you choose to import, extracted source text, reading positions, highlights, notes, and saved reading aids. It also stores source identifiers and generated analysis linked to those books. These records belong to your account. Other Eazo users cannot access them through the library.</p>
    <p>Signing in does not automatically import a guest library. You choose whether to copy this device’s guest books and progress into your account. Cloud changes synchronize while signed in and online. An offline device keeps its pending changes locally.</p>
    <h2>Devices and conflicting changes</h2>
    <p>This browser keeps account-specific reading progress. An already-open book can continue working offline; opening or reloading a cloud book still requires an internet connection. Signing out hides that account’s library and returns to the guest library. Saved account data can remain in browser storage until it is cleared; use a trusted device for private reading.</p>
    <p>If devices save different changes to the same book, Eazo preserves the conflicting save and asks you which version to continue with. It does not silently replace a newer cloud save with an older offline version.</p>
    <h2>Services and limits</h2>
    <p>Account identity, private files, and database records are handled by Supabase. Hosting serves the Eazo application. If you request AI reading aids or book analysis, the relevant text is sent to the configured model provider to answer that request.</p>
    <p>The initial cloud allowance is 100 books, 500 source versions, 100 MiB of source files per account, 50 MiB per source file, and 100 MiB of saved reading history. Generated analysis has separate usage controls. Eazo shows an error if a save exceeds its allowance, and keeps the unsaved work locally.</p>
    <h2>Export and deletion</h2>
    <p>Account settings provide an archive of your source files and saved reading data. You can delete your Eazo account from the same place. Deletion blocks new writes, cancels queued and running analysis records, removes private files and reading records, then deletes the sign-in identity. If an operation fails, retry deletion to finish cleanup.</p>
    <p>A minimal account identifier remains as a deletion marker to prevent late uploads or worker writes. Deletion does not erase copies you exported, copies on other offline devices, or your Google account. Service backups and operational logs may persist according to the relevant service’s retention settings.</p>
  </main>;
}
