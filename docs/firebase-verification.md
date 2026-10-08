# HairQ Firebase end-to-end verification

Historical verification performed on 2026-10-09. **Not production-ready: the customer privacy check fails.** PostgreSQL, Drizzle and legacy rollback/reference source were retained during that verification, then removed by the subsequently authorized Firebase-only cleanup. Firebase remains the only active database/authentication system. No production records, existing PostgreSQL users or Firebase Console settings were changed. The outcomes below are evidence from the verification step, not a new end-to-end run after cleanup; the customer privacy blocker remains unchanged.

## Results and scope

The real Next.js development application ran at `http://127.0.0.1:3100`, with headless Chrome and real Firebase SDKs connected to isolated Auth/Firestore emulators under `demo-hairq-verification`. Two browser signups created separate tenants. All fixtures were synthetic and ephemeral. The runner refuses occupied ports and any real project, strips deployment credentials, and terminates its own services after testing.

| Area | Result / evidence |
| --- | --- |
| Authentication | Browser signup, login, logout, reload and restart passed. Auth UID profiles and salon provisioning persisted. Browser Auth uses memory persistence; application authentication uses Admin-verified HttpOnly cookies. |
| Authorization | Actual HTTP tests passed for owner, manager and front_desk; unauthenticated, invalid token/cookie, incorrect role, inactive/missing profile and Firebase-disabled accounts were denied. Role fixtures were changed through test-only Admin writes. |
| Operator tenancy | Both salons could read/write themselves; cross-salon body/query requests returned 403 and foreign document IDs were rejected. |
| Salon | Settings, branding, queue capacity, booking settings and seven working-hour documents persisted through API reads and an app restart. |
| Services/staff | Create, edit, active state, on-shift state, price/duration and staff-service links passed through actual APIs. Delete/archive/cascade behavior is additionally covered by unit tests. |
| Customers | Creation, normalized phone upsert, notes update, duplicate phone conflict and foreign-tenant rejection passed. Client financial-statistic updates were rejected. Email is not a unique key in the existing schema. |
| Queue | Six simultaneous HTTP joins with capacity four produced four entries, two 409s, distinct tokens and positions 1–4. Move/start, concurrent idempotent completion, cancel, skip and no-show passed. |
| Bookings | Two simultaneous overlapping staff bookings produced one 201 and one 409. Confirmation, token lookup, rescheduling, idempotent completion, public availability/create/cancel and invalid relationships passed. |
| Visits/statistics | Queue and booking completion each created one visit, updated total visits/spend, last visit/service and loyalty points once, using server-side transaction logic. |
| Campaigns/notifications | Schedule/cancel/send, audience count, notification persistence and read state passed. A real local push transport failure did not roll back campaign/notification persistence. |
| Push | Tenant-scoped subscription storage, preferences and response key redaction passed. Unit tests verify HTTP 410 invalidation and post-commit delivery. Successful real-device delivery remains untested. |
| Frontend | Dashboard, settings, services, staff, customers, queue, bookings, audience and notifications rendered without browser page errors. Actual browser form interactions cover signup/login/logout; other feature writes were exercised through HTTP, not every UI control. |
| API audit | All 25 route files audited: 14 owner route files / 27 handlers use shared Firebase guards. All active business repositories use Firestore. See [route-by-route audit](hairq-api-audit.md). |
| Rules/indexes | Direct unauthenticated emulator reads and writes returned 403. Client access stays deny-by-default. No composite queries are issued; existing index configuration needs no additional composite indexes. |
| Errors/caching | Missing/malformed IDs, authentication, tenant errors, duplicates, booking conflicts and queue capacity were exercised. Unit fault injection verifies sanitized Firestore-unavailable 503s. Protected responses use `private, no-store`. |

Local emulators cannot establish production service-account permissions, deployed project configuration, HTTPS cookie/proxy behavior, real email/reset delivery, successful device push or large-salon performance. Invalid/expired/revoked/stale credential paths have unit coverage; the real HTTP suite tests malformed tokens/cookies and disabled accounts, without waiting for a 14-day cookie expiry.

## Commands and outcomes

| Command | Outcome |
| --- | --- |
| `npm test` | 51 passed; no failures, skips or cancellations. |
| `node scripts/verify-firebase-e2e.mjs` | 27 checks passed; 1 security check failed; exit code 1 intentionally retained. |
| `npm run typecheck` | Passed after the development server stopped. A prior concurrent attempt encountered partially generated Next development type files; no source type errors remained. |
| `npm run lint` | Failed: 23 pre-existing frontend errors and 5 warnings. Rules were not disabled and unrelated UI was not rewritten. |
| Focused ESLint | Passed for changed auth/Firebase/push modules, auth form, all tests, verification scripts and ESLint configuration. |
| `npm run build` | Passed. All API and dashboard routes are dynamic; login/signup are static shells. |

The machine-readable emulator results and browser screenshot are local ignored artifacts: `.verification-tools/report.json` and `.verification-tools/dashboard.png`. They are not production data or committed credentials.

The production client-bundle scan found no `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `firebase-admin`, PEM private-key marker, `VAPID_PRIVATE_KEY` or `DATABASE_URL` references in `.next/static`. No real credential files were tracked by Git; `.env.local`, service-account JSON patterns, private-key files and local push-key files are ignored. Since no real credentials were supplied, this checks boundaries and tracked-file hygiene, not a live-secret deployment.

## Remaining issues

| Classification | Issue / required action |
| --- | --- |
| **BLOCKER** (pre-existing) | `POST /api/public/[slug]/lookup` returns private customer history using only a phone number (observed 200; expected authorization rejection). `/notify` reads/mutates customer notifications and subscription preferences using a numeric customerId, with no ownership proof. Successful unauthenticated notification calls confirm this exposure. Decide and implement customer ownership verification before release; merely checking the salon slug does not fix it. This verification does not invent customer accounts or disable existing screens. |
| **BLOCKER for live deployment** | No `.env.local` or real Firebase credentials were present. Emulator validation passes but a real project is not configured/verified here. Supply the documented environment and perform staging validation. |
| **IMPORTANT** | Real-device Web Push, production cookie/origin behavior, password-reset/setup email, and real-project permissions require staging checks. |
| **IMPORTANT** | Repositories load tenant collections and filter/order in memory; shared tenant metadata serializes writes. Mutations above the explicit 450-write safety cap return 413. Load/cost testing and large campaign batching remain necessary before scale; concurrency tests here use small fixtures. |
| **PRE-EXISTING** | Full lint has 23 frontend errors and 5 warnings, chiefly React effect/setState patterns and font/image warnings. |
| **PRE-EXISTING** | Campaign content editing is not supported by the existing PATCH contract (cancel/delete only). Scheduled campaigns persist, but no execution scheduler exists. |

## Fixes and files in this verification step

- `src/lib/auth-csrf.ts`: derive the public origin from Host or optional validated `HAIRQ_APP_ORIGIN`, rather than Next's internal request URL. Foreign origins still fail. Added a regression test in `tests/firebase-auth.test.mjs`.
- `src/components/auth-form.tsx`: POST fallback and disabled pre-hydration controls prevent native GET password submission and pre-hydration input loss. The UI design is unchanged.
- `src/lib/web-push.ts`: explicit server-only boundary; production no longer silently generates ephemeral VAPID keys. Existing keypairs must be configured.
- `src/lib/firebase/client.ts`: guarded, once-only localhost Auth emulator connection. Production/remote emulator access is rejected. Added foundation regression coverage.
- `src/lib/firebase/admin-env.ts` and `firestore.rules`: corrected outdated explanatory comments; authorization/rule policy was not weakened.
- `.env.example`: optional canonical origin and local emulator placeholders only. `.gitignore`, `tsconfig.json`, `eslint.config.mjs`: exclude isolated tooling/credentials/generated artifacts from source checks and tracking.
- `firebase.json`: Auth emulator configuration alongside Firestore.
- `tests/firebase-verification.test.mjs`, `tests/support/firestore-harness.mjs`: safe 503 fault injection, 410 invalidation and stable production VAPID coverage.
- `scripts/verify-firebase-e2e.mjs`, `scripts/verification/firebase-scenarios.mjs`: reproducible isolated browser/API/security/concurrency runner.
- `docs/hairq-api-audit.md`, this report, and `docs/firebase-auth-migration.md`: API inventory, evidence and authentication verification notes.

No application packages were added. Firebase CLI and Playwright were installed under ignored `.verification-tools` only, and a portable Java 21 runtime was placed there for the Firestore emulator. Existing Chrome was used. Neither package.json nor the application lockfile was changed by this verification step.

## Historical PostgreSQL references and subsequent cleanup

During this verification, `src/db/index.ts`, `src/db/schema.ts`, Drizzle configuration/dependencies, `scripts/seed.mjs`, `src/lib/legacy/postgres-auth/*` and `legacy/postgres/*` were rollback/reference code. `scripts/generate-firestore-migration.cjs` was an offline source conversion tool and was not run. The subsequent authorized cleanup removed those files, unused database dependencies and the `.env.example` `DATABASE_URL` placeholder. Active auth still mentions `hq_session` only to clear an obsolete browser cookie; compatibility IDs do not enable old sessions or PostgreSQL reads. No active route imports PostgreSQL/Drizzle or executes legacy owner/session queries. Rollback now requires a previous complete source checkout or deployment artifact, its matching environment and reconciliation of post-cutover Firebase data; there is no in-place database fallback.

## Manual configuration and browser verification

1. Configure a staging Firebase project with a web app and Firestore database. Enable Email/Password and add localhost plus the exact Vercel/custom domains to Auth authorized domains. Review password policy and reset-email templates; HairQ has no existing reset screen, so use Firebase's hosted reset/setup mechanism.
2. Set `.env.local` locally or encrypted Vercel variables: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`; server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`; stable `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Set `HAIRQ_APP_ORIGIN` to the deployment's exact HTTPS origin if using canonical proxy-origin validation. Never commit JSON credentials; never set emulator variables in production.
3. Deploy the existing deny-by-default rules and index configuration explicitly to that staging project. No extra composite indexes were required by the audited queries. Verify service-account permissions for Auth and Firestore.
4. Provision approved existing operators manually into Firebase Auth and `users/{uid}` with validated existing salon/role links. Public signup creates a new salon; it must not be used to claim an existing one. Do not import or change PostgreSQL passwords automatically.
5. After resolving the customer privacy blocker, test the real deployed browser on HTTPS: signup/login/reload/logout, each operator role, two salons, settings, queue/booking completion and customer history, notifications, push permission/subscription, successful device delivery and reset/setup email. Check Secure cookies and rejection of replayed/revoked state. Recheck real-project behavior after redeploying public Firebase config.

To rerun the isolated suite on this Windows workstation, run `node scripts/verify-firebase-e2e.mjs` with ports 3100, 8080, 9099 and 4400 free. The current installed tooling lives in `.verification-tools`; on a clean machine install `firebase-tools` and `playwright` there using `npm install --prefix .verification-tools --no-package-lock --no-save firebase-tools playwright`, provide Java 21 under `.verification-tools/runtime/<jre>/bin/java.exe`, and adjust the script's Chrome executable path if necessary. The runner generates local-only VAPID fixtures in memory and writes no production seed records.

Firebase's [session cookie guidance](https://firebase.google.com/docs/auth/admin/manage-cookies) documents the server cookie pattern and revocation; [Auth emulator guidance](https://firebase.google.com/docs/emulator-suite/connect_auth) explains why emulator credentials are strictly local. This report distinguishes emulator evidence from real-project readiness.
