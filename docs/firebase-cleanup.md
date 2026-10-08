# Firebase-only cleanup

The authorized cleanup removes unused PostgreSQL/Drizzle source and packages. Firebase Authentication and Firestore are the only active identity and data systems. No UI, API contracts, business behavior or database records were changed.

## Deleted files

40 files were removed:

```text
src/db/index.ts
src/db/schema.ts
src/lib/legacy/postgres-auth/auth.ts
src/lib/legacy/postgres-auth/onboarding.ts
src/lib/legacy/postgres-auth/route.ts
src/lib/legacy/postgres-auth/README.md
drizzle.config.json
scripts/seed.mjs
scripts/generate-firestore-migration.cjs
legacy/postgres/src/lib/web-push.ts.txt
legacy/postgres/src/lib/salon-data.ts.txt
legacy/postgres/src/lib/queue-actions.ts.txt
legacy/postgres/src/lib/onboarding.ts.txt
legacy/postgres/src/lib/auth.ts.txt
legacy/postgres/src/lib/api-helpers.ts.txt
legacy/postgres/src/app/site/[slug]/page.tsx.txt
legacy/postgres/src/app/page.tsx.txt
legacy/postgres/src/app/api/health/route.ts.txt
legacy/postgres/src/app/api/auth/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/route.ts.txt
legacy/postgres/src/app/api/owner/summary/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/queue/[token]/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/queue/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/notify/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/lookup/route.ts.txt
legacy/postgres/src/app/api/owner/staff/[id]/route.ts.txt
legacy/postgres/src/app/api/owner/staff/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/book/[token]/route.ts.txt
legacy/postgres/src/app/api/public/[slug]/book/route.ts.txt
legacy/postgres/src/app/api/owner/services/[id]/route.ts.txt
legacy/postgres/src/app/api/owner/services/route.ts.txt
legacy/postgres/src/app/api/public/push-resubscribe/route.ts.txt
legacy/postgres/src/app/api/owner/salon/route.ts.txt
legacy/postgres/src/app/api/owner/campaigns/route.ts.txt
legacy/postgres/src/app/api/owner/queue/[id]/route.ts.txt
legacy/postgres/src/app/api/owner/queue/route.ts.txt
legacy/postgres/src/app/api/owner/bookings/[id]/route.ts.txt
legacy/postgres/src/app/api/owner/bookings/route.ts.txt
legacy/postgres/src/app/api/owner/customers/[id]/route.ts.txt
legacy/postgres/src/app/api/owner/customers/route.ts.txt
```

## Dependencies and configuration

Removed `pg`, `drizzle-orm`, `drizzle-kit`, `@types/pg` and unused `dotenv` from package.json and the lockfile. npm removed 31 installed packages. Package metadata now names the application `hairq` instead of the old PostgreSQL template name. The `DATABASE_URL` placeholder and all connection requirements are gone.

Firestore entities, field metadata, query helpers and repositories remain because the application uses them. `legacyOwnerId`/`ownerId` remain compatibility metadata, and Firebase login/logout still delete an obsolete `hq_session` cookie. Neither reads legacy sessions nor grants legacy authentication.

Remaining PostgreSQL references describe historical migration/account setup and rollback in documentation. The isolated verification runner also removes inherited `DATABASE_URL` from its test environment as a defensive measure; it does not require or use it. There are no PostgreSQL/Drizzle imports, password hashing implementations or dependencies in active source or the application lockfile. Unused PostgreSQL stubs were removed from the test harness.

Firebase Admin credentials remain behind `server-only` modules. `.env.example` contains blank secret placeholders, and `.gitignore` excludes environment files, service-account JSON patterns, private keys and local VAPID key material. No tracked credential files were found.

## Validation

- `npm run typecheck`: passed.
- `npm test`: all 51 tests passed.
- `npm run build`: passed; API/dashboard routes remain dynamically rendered.
- Focused ESLint for changed code/test files: passed.

Historical test results and inventories remain explicitly labeled in the migration documents. Rollback now requires a previous complete source checkout or deployment artifact and its original environment; removed source snapshots cannot be used from this checkout. The customer privacy failure documented by the earlier [end-to-end verification](firebase-verification.md) is unchanged by this source cleanup.
