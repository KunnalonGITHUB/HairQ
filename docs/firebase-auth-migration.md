# HairQ Firebase authentication cutover

This document records the historical authentication cutover. Firebase Auth and Firestore remain the active architecture described below. The subsequent authorized Firebase-only cleanup removed PostgreSQL runtime/schema/configuration, dependencies, legacy auth modules and source snapshots; they are no longer present in this checkout. No real users, password hashes, customer records or production database records were imported, modified or deleted by either source-code step. Validation results and file inventories below describe their original migration step, not a new verification run.

## Before and after

Previously `/api/auth` accepted email/password, looked up PostgreSQL `owners`, verified a salted Node `scryptSync` hash, inserted a random token into `sessions`, and set a 30-day `hq_session` HttpOnly cookie. Protected dashboard pages and every owner API used `getSessionUser`. Authorization allowed `owner`, `manager`, and `front_desk`. Staff job titles are separate from operator roles. Customers do not have accounts. There is no existing password-reset route or middleware.

Now the existing form uses Firebase Client Auth Email/Password with `inMemoryPersistence`. Its password input is uncontrolled; the password is cleared from the input immediately and passed transiently to Firebase, never posted to HairQ or kept in React state. The browser exchanges the Firebase ID token at the same `/api/auth` endpoint. Firebase Admin verifies the token, checks revocation and recent password sign-in (within five minutes), and loads Firestore authorization. Admin mints a Firebase session cookie, `hq_firebase_session`, valid for 14 days: HttpOnly, Secure in production, SameSite=Lax, host-only, path `/`.

The browser then signs out the Firebase SDK. The server cookie is the sole persistent application authentication state; neither tokens nor credentials are placed in browser storage. Cookie expiry requires another login. Admin verifies each protected request's session with revocation checking, and reloads the profile so role/membership/deactivation changes take effect on the next request. Firebase's recommended cookie flow and maximum lifetime are described in [Firebase session cookie documentation](https://firebase.google.com/docs/auth/admin/manage-cookies).

Logout revokes the Firebase user's refresh tokens (also invalidating other Firebase sessions on their next verification) and clears both Firebase and legacy browser cookies. PostgreSQL session rows are untouched. Invalid or expired sessions are cleared locally on logout. Operational failures are reported; credentials and SDK error details are never returned.

## Server-owned authorization

`users/{firebaseAuthUid}` contains:

| Field | Type | Purpose |
| --- | --- | --- |
| uid | string | Verified Firebase identity, matches document ID |
| email | string | Firebase account email at provisioning |
| name | string | Operator display name |
| role | owner / manager / front_desk | Existing HairQ operator authorization |
| salonId | string | Existing numeric business salon ID encoded as a document ID |
| staffId | string or null | Optional existing staff association; job title does not grant access |
| active | boolean | Server-controlled authorization enabled flag |
| createdAt, updatedAt | Firestore Timestamp | Profile audit timestamps |
| legacyOwnerId | number or null | Optional old owner ID for migration/compatibility, never identity proof |

The earlier foundation type can also describe `customer`, but this step never provisions customer accounts and all operator guards reject that role. Password hashes, passwords, session tokens, and Admin credentials are absent from profile documents. New users have `legacyOwnerId: null`; the existing owner response field remains nullable for compatibility. Identity is always `uid`.

Signup creates a Firebase Auth account in the browser. The server derives UID and email from verified Firebase identity, hardcodes the new owner's role, and allocates a new salon ID. It never accepts a role or existing salon membership from the request. `users/{uid}`, the salon, existing starter services/staff/hours/offer, tenant metadata, and global `_meta/salonIds` allocation are committed in one Firestore transaction. Salon IDs advance past both the allocation counter and existing salon IDs. Existing starter staff are business records, not additional Auth accounts.

An Auth account can exist without a profile if provisioning fails. No partial Firestore workspace is committed, and the API reports failure. Retrying signup signs into the same Firebase account and retries provisioning. A repeated or concurrent successful signup returns the original salon without changing its ownership, role, name, or membership. If cookie creation fails after the Firestore commit, the same retry resumes safely. No automatic account deletion conceals these failures.

All owner APIs derive their tenant from the server profile, validate supplied body/query `salonId` against it, enforce existing operator roles, and pass the authorized tenant to the repositories. Protected responses use `Cache-Control: private, no-store`. Unauthenticated requests return 401, unauthorized roles/membership return 403. Dashboard pages redirect unauthenticated/unauthorized users to login. Public salon, queue, booking, notification, lookup, push, and health routes retain their existing access model. Public customer access is unchanged; this step adds no customer authentication or additional assurances about the existing public endpoints.

## CSRF and endpoint contract

`GET /api/auth` returns `{csrfToken}` and sets a random HttpOnly same-site CSRF cookie. Auth and owner mutations require same-origin `Origin` and `X-HairQ-CSRF` matching that cookie. Cross-site fetches are rejected. The shared client API helper obtains the proof automatically for protected mutations; public API callers are unchanged. Manual clients need the GET response, its cookies, matching Origin, and the header.

End-to-end verification corrected origin handling when Next.js constructs an internal request URL: checks use the browser Host header, or the optional canonical `HAIRQ_APP_ORIGIN` configured for that deployment. Production canonical origins must use HTTPS. Forwarded host headers are not accepted as authority. Login/signup controls remain disabled until hydration and the form explicitly uses POST, preventing a native GET submission from placing a password in the URL before React attaches.

`POST /api/auth` remains the login/signup/logout endpoint. Login now sends `{action:"login", idToken}`; signup sends `{action:"signup", idToken, salonName, ownerName, phone, city}`. Sending passwords to this server endpoint is no longer supported. The existing success shapes remain `{ok:true, slug}` (login 200, signup 201) and `{ok:true}` (logout 200); errors remain `{error}` with meaningful HTTP statuses. Other request/response business contracts are unchanged.

Direct browser Firestore access remains denied by the existing deny-by-default rules. Admin bypasses rules, so server authorization remains mandatory. Public code cannot write profiles. Roles, active state, UID, salon assignment, audit timestamps, and legacy links must be maintained only through trusted administrative tooling. No owner-facing role administration endpoint was introduced.

## Existing operator account migration: manual, separate step

Old PostgreSQL credentials cannot log in through the new flow until the operator has a Firebase Auth identity and a validated profile. Do not use public signup to migrate an existing salon: signup creates a new workspace. Do not link profiles merely because a browser supplies a matching email or salon ID.

The fresh-account approach is to inventory existing owner IDs/emails/roles/salon IDs read-only, verify identity and salon ownership operationally, create the Firebase Email/Password account through trusted administration, and provision `users/{uid}` linked to the existing Firestore salon with its exact existing role and optional `legacyOwnerId`. Send Firebase's password-reset/setup email using Firebase's supported mechanism, then verify login and tenant access. This does not modify PostgreSQL or store a password in Firestore. There was no reset flow to migrate in HairQ; this step adds no custom reset tokens or new reset UI.

An alternative future import is supported in principle: Firebase supports `STANDARD_SCRYPT`. The historical implementation used Node's default scrypt N=16384, r=8, p=1 and a 64-byte derived key. Its stored format was `saltHex:derivedKeyHex`. Critically, the salt input was the UTF-8 text of `saltHex`, not hex-decoded random bytes. A proposed importer would use `memoryCost:16384`, `blockSize:8`, `parallelization:1`, `derivedKeyLength:64`, passwordHash decoded from hex, and passwordSalt from the salt text as UTF-8. Validate an explicitly approved import against isolated known-password fixtures and the actual deployed historical format before selecting it. No importer was written or executed in this step. See [Firebase supported imports](https://firebase.google.com/docs/auth/admin/import-users) and [Node scrypt defaults](https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options).

## Cleanup and rollback

The original cutover retained old source temporarily. The authorized cleanup has now removed `src/lib/legacy/postgres-auth/*`, `src/db/*`, Drizzle configuration, PostgreSQL dependencies, old seed/generator scripts and `legacy/postgres/*` snapshots. The current application neither reads PostgreSQL nor requires `DATABASE_URL`. Existing production PostgreSQL records were not touched by the source cleanup.

Rollback requires an archived pre-cutover deployment artifact or a previous source checkout with its matching lockfile and environment; there is no in-place PostgreSQL fallback in the current tree. Restoring only the old route is insufficient: restore the old form, session helper, onboarding, shared API guard/client CSRF behavior and dashboard calls together. Freeze writes and export new Firestore changes for reconciliation first. Verify that the external historical database and its backups are still available. New Firebase-only users have no PostgreSQL passwords or sessions; plan reconciliation before rollback involving those accounts. New Firestore salon IDs also require aligning PostgreSQL allocation before resuming legacy signup. Do not automatically write Firebase registrations back into PostgreSQL.

## Configuration and manual validation

No packages or new secrets are required. Set the existing four `NEXT_PUBLIC_FIREBASE_*` web configuration values and the server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` to the same project. Configure `.env.local` locally and encrypted environment settings in Vercel. Never commit a service-account JSON or prefix Admin credentials with NEXT_PUBLIC. Public configuration is inlined at build time, so redeploy after changing it. `DATABASE_URL` is no longer required or listed in `.env.example`.

Manually enable Firebase Authentication Email/Password, register the existing web app, and add localhost plus the Vercel/custom production domains to Auth authorized domains. Set a minimum eight-character Firebase password policy to match signup, and review email-enumeration protection. Review the Firebase password-reset email template for the manual account setup process; keep Firebase's hosted reset handler because HairQ has no password-reset page. Use a server service account authorized for Auth session creation, user lookup/revocation and Firestore access. Do not enable public Firestore access. No Console settings were changed automatically.

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`. Tests use isolated in-memory fixtures and mocked Firebase SDKs: no databases or actual accounts are contacted. They cover valid/invalid/revoked sessions, recent token verification, unauthenticated/public/protected routes, allowed/denied roles, tenant mismatch, CSRF, idempotent/concurrent signup, failed provisioning recovery, browser memory persistence, token-only exchanges, and logout.

Before deploying the cutover, use a staging Firebase project and real browser to test signup → dashboard → reload → queue/booking/customer mutations → logout, plus existing-salon manually provisioned owner/manager/front_desk logins. Validate role deactivation, Firebase-disabled/revoked accounts, cross-salon request attempts, password-reset email, production Secure cookies, and both authorized domains. This real-project smoke test requires manual Console configuration and operator provisioning and is not replaced by mocked unit tests.

## Historical implementation inventory

Files created in this authentication step:

```text
src/lib/auth-client.ts
src/lib/auth-csrf.ts
src/lib/legacy/postgres-auth/auth.ts
src/lib/legacy/postgres-auth/onboarding.ts
src/lib/legacy/postgres-auth/route.ts
src/lib/legacy/postgres-auth/README.md
tests/firebase-auth.test.mjs
tests/firebase-auth-client.test.mjs
tests/support/firestore-harness.mjs
docs/firebase-auth-migration.md
```

Files modified in this authentication step:

```text
.env.example
src/lib/auth.ts
src/lib/api-helpers.ts
src/lib/onboarding.ts
src/lib/firebase/auth.ts
src/lib/firebase/admin.ts
src/lib/firestore/store.ts
src/app/api/auth/route.ts
src/app/api/owner/bookings/route.ts
src/app/api/owner/bookings/[id]/route.ts
src/app/api/owner/campaigns/route.ts
src/app/api/owner/customers/route.ts
src/app/api/owner/customers/[id]/route.ts
src/app/api/owner/qr/route.ts
src/app/api/owner/queue/route.ts
src/app/api/owner/queue/[id]/route.ts
src/app/api/owner/salon/route.ts
src/app/api/owner/services/route.ts
src/app/api/owner/services/[id]/route.ts
src/app/api/owner/staff/route.ts
src/app/api/owner/staff/[id]/route.ts
src/app/api/owner/summary/route.ts
src/app/dashboard/layout.tsx
src/app/dashboard/page.tsx
src/app/dashboard/notifications/page.tsx
src/components/auth-form.tsx
src/components/owner/shell.tsx
src/components/ui.tsx
tests/firestore-repositories.test.mjs
tests/firebase-foundation.test.mjs
docs/firestore-migration.md
```

All 27 exported handlers across the 14 owner route files use the shared request-aware Firebase authorization guard. The dashboard layout continues protecting the existing dashboard page tree. All nine `/api/public` route files and `/api/health` preserve public access; login/signup pages and public salon/customer pages stay public. Business routes were not removed or redesigned.

No npm packages, Firestore indexes, or client permissions were added in this step. The new global `_meta/salonIds` document coordinates signup allocation; its latest-salon query uses the existing default single-field `id` index. Existing tenant serialization and security rules remain in place. The Admin initializer additionally rejects unsafe Auth emulator environments, including when an Admin app is already cached.

The subsequent approved cleanup removed the unused source/configuration/dependencies listed above. It did not drop PostgreSQL tables or delete external data. The historical inventory is preserved as implementation evidence; deleted paths do not describe the current file tree.

Historical validation results for the auth cutover: TypeScript passes. Production build passes after allowing Next.js worker process spawning (the sandbox attempt compiled but hit `spawn EPERM`). All 46 automated tests pass. Full lint retains the known 23 pre-existing frontend errors and five warnings; focused lint for the auth/server/repository/routes/dashboard/form/tests passes. The pre-existing UI/shell lint violations were left unchanged as requested. Automated tests use SDK doubles, not a real Firebase project. Production signup, Auth cookies and Firebase-hosted password reset still require the manual staging smoke test above. Later emulator verification is recorded separately in [firebase-verification.md](firebase-verification.md).
