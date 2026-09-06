# Unified bookshelf and account reading sync

Signed out: the two default books and browser-local imports. Signed in: default books, browser-local imports, and private account books share the existing shelf. Matching local/account copies share a spine; selecting that spine opens the account version. Existing local-only books remain local until explicitly copied from Account. Signed-in imports default to account storage, with an explicit device-only option. Default-book reading gets its own account source and reading history, without automatically importing another browser user's guest history.

Account reading includes passage selections/anchors, generated aids, their placement, interactive state, reading position, map view, and immutable generation footprints used for heatmaps. Existing conflict recovery is retained. PDFs sync extracted reading text; original PDFs remain in the device cache. New account imports use an account-scoped device cache, hidden after sign-out; existing guest copies remain in the guest library. An already-open account book can save offline; opening a cloud book requires connectivity.

Generated illustration bytes are content-addressed, immutable files in private `eazo-reading` storage. Both visible artifacts and heatmap history reference the same bytes. Reading snapshot requests store small references; clients verify SHA-256 and the full schema when restoring them. Prior inline images remain readable. Account export includes the referenced image files; account deletion cleans up the new bucket before deleting records. Limits: 14 MB per illustration data URL and 100 MiB total illustration storage per account.

## Release order

1. Apply `supabase/migrations/202609060008_reading_images.sql` to the target Supabase database.
2. Deploy the application changes.
3. Verify account reading across two authenticated browser contexts, including generated illustrations and sign-out.

No production migration or deployment was performed for this change. The migration was applied only to a temporary local PostgreSQL test database. Rollback-only storage-policy checks pass (`supabase/tests/reading-images.sql`). The isolated production build, focused unit/integration tests, and local browser shelf tests pass. Live hosted cross-device sync still needs the release checks above.

The broader suite has two baseline failures: `chinese-sample.test.ts` expects moving an upload into slot 1 to be rejected, and `fal-image.test.ts` expects one successful artifact in mixed-provider dispatch. Both reproduce without these changes.
