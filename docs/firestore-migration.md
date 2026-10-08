# HairQ Firestore data-access migration

This document records the historical data-layer step. Active authentication has since moved to Firebase; see [the authentication cutover](firebase-auth-migration.md) for the current flow, operator provisioning and rollback requirements. The subsequent authorized Firebase-only cleanup removed PostgreSQL/Drizzle source, configuration, dependencies, legacy auth and source snapshots. PostgreSQL authentication statements, implementation inventories and validation outcomes below describe the earlier step, not the current runtime or a new validation run. Historical database records were not deleted.

At the time of this data-layer step, business data moved to the Firebase Admin
SDK through server-only repositories while PostgreSQL still owned credentials,
owner membership and sessions. Passwords and session tokens were not copied to
Firestore. That step did not activate Firebase Authentication, import existing
records, run a seed, deploy rules or change UI. Authentication has since migrated
to Firebase, and the unused PostgreSQL implementation has been removed.

## Data model and compatibility

`src/lib/firestore/entities.ts` declares every operational field from the original
Drizzle schema, which is no longer retained in this checkout. `schema-metadata.ts`
records its defaults and nullability without
a runtime Drizzle import. Repositories store dates as Firestore `Timestamp` and
return `Date` DTOs so JSON timestamps and frontend calculations retain their
existing behavior. Integer prices, visit amounts, customer spend and loyalty
points retain their existing units. No conversion to cents was introduced.

API IDs remain numbers. Firestore document IDs are their string representation.
New IDs use per-tenant, per-entity counters and check the imported maximum ID.
Queue and booking tokens remain random opaque strings, not daily ticket numbers.

| Path | Document ID / purpose |
| --- | --- |
| `users/{uid}` | Authorization profiles; unused in the original data-layer step, now populated and read by Firebase authentication |
| `salons/{salonId}` | Existing numeric salon ID as a string |
| `salons/{salonId}/workingHours/{dayId}` | Day `0` through `6`; original numeric `id` remains a field |
| `salons/{salonId}/services/{serviceId}` | Numeric ID as a string |
| `salons/{salonId}/staff/{staffId}` | Numeric ID; service mappings on the staff document |
| `salons/{salonId}/customers/{customerId}` | Numeric ID as a string |
| `salons/{salonId}/customers/{customerId}/pushSubscriptions/{subscriptionId}` | Numeric subscription ID; original singleton-per-customer behavior |
| `salons/{salonId}/queue/{queueId}` | Numeric queue ID as a string |
| `salons/{salonId}/bookings/{bookingId}` | Numeric booking ID as a string |
| `salons/{salonId}/visits/{visitId}` | Numeric visit ID as a string |
| `salons/{salonId}/offers/{offerId}` | Numeric offer ID as a string |
| `salons/{salonId}/campaigns/{campaignId}` | Numeric campaign ID as a string |
| `salons/{salonId}/notifications/{notificationId}` | Numeric notification ID as a string |
| `salons/{salonId}/_meta/state` | Transaction serialization document and entity counters |
| `salons/{salonId}/customerPhones/{sha256Phone}` | Server-maintained phone uniqueness reservation |
| `salonSlugs/{slug}` | Atomic global salon-link uniqueness reservation |
| `tokens/{sha256Token}` | Atomic queue/booking token uniqueness reservation |
| `pushEndpoints/{sha256Endpoint}` | Resolves an existing service-worker endpoint to a known salon/customer/subscription |

The additional lookup documents enforce constraints PostgreSQL previously
provided, and avoid cross-salon subscription scans. They contain no passwords
or Admin credentials and are denied to clients by the rules.

Staff documents contain `serviceIds` plus `serviceLinks: [{id, serviceId}]` to
retain existing mapping IDs. No separate staff-service collection is needed.
Existing HairQ semantics for an empty service mapping (all services) remain.
Optional internal `queue.bookingId` and `booking.queueId` fields link a booking
moved to the queue, preventing duplicate billing. These fields and mapping
metadata are excluded from ordinary DTOs.

## Repositories and transactions

`repositories.ts` exports salon, working-hours, service, staff, staff-service,
customer, push-subscription, queue, booking, visit, offer, campaign and notification
repositories. Each child operation takes a numeric `salonId` explicitly. The
query specifications in `query.ts` are typed in-memory predicates, joins,
projections and ordering; they do not execute SQL or expose the Firestore SDK to
routes. Only root salon-directory discovery and endpoint capability resolution
precede determining a tenant. There are no child collection-group scans.

`store.ts` uses an AsyncLocalStorage request scope. Owner handlers validate the
existing session and owner/manager/front_desk role, then set an immutable salon
scope. Public handlers resolve the salon by slug or the existing push endpoint.
Attempting to read another salon in the same transaction fails with 403.

All mutations within one handler participate in one Firestore transaction.
The transaction reads `_meta/state`, salon state and required tenant collections,
buffers mutations, validates reservations, and flushes writes after all reads.
The shared state document serializes concurrent writers, including capacity
checks and collection inserts. Callback retries use a cached request body.
Validation responses (HTTP 400 or above) discard every tentative write/effect.
Repository calls outside a handler start a transaction for their mutation.

This follows Firestore's [transaction read/retry semantics](https://firebase.google.com/docs/firestore/manage-data/transactions).

- Queue joins allocate IDs and positions atomically, enforce capacity and one
  active entry per customer, and validate customer/service/staff tenancy and
  service capabilities. Start, move, update, skip, cancel and no-show mutate the
  same transaction snapshot. A serving chair/staff member cannot be double-used.
  Terminal entries cannot be restarted. Existing queue projection/ETA code is
  unchanged. Removals resequence active positions.
- Bookings validate service/staff relationships and compare interval overlaps
  inside the transaction. Concurrent creation, rescheduling, confirmation and
  reassignment serialize. A customer cannot have overlapping active bookings.
  Unassigned manual bookings choose an eligible free staff member; unavailable
  slots return 409. Public creation retains `buildSlots` checks and also enforces
  the configured booking horizon. Manual owner bookings retain their existing
  ability to choose times outside public opening hours.
- Completion atomically writes a visit, marks the source complete, updates
  visit/spend/last-visit/last-service/preferred-staff fields, and awards the
  existing `max(1, round(price / 50))` loyalty points. Repeated/concurrent
  completion does not create a second visit or increment totals twice. Linked
  booking/queue completion is also counted once. Customer PATCH does not accept
  financial statistics.
- Customer phone reservations and profile changes are transactional; phone
  uniqueness is scoped to the salon. Email is not unique in the original
  customer schema and no new email uniqueness constraint was invented.
  Customer deletion preserves existing cascades, including nested subscriptions.
  Referenced services/staff archive rather than orphan historical records.

## Notifications and security

Campaign and notification fields, scheduling status, audience computation and
read state are preserved. Campaign notifications commit together. Web Push runs
after a successful commit, avoiding repeated delivery during transaction retries.
Campaign POST returns actual post-commit delivery counts. Subscription permission
and opt-in preferences are checked before sending. HTTP 404/410 responses clear
the invalid transport, set `invalidAt`, and release the endpoint reservation.
Public/owner profile subscription DTOs keep their keys but redact `p256dh` and
`auth`. VAPID private keys remain server-only; keep the existing VAPID pair.

`firestore.rules` denies all direct client reads and writes, including `users` and
lookup documents. No browser Firestore access was added. Admin SDK calls require
server authorization because [server libraries bypass rules](https://firebase.google.com/docs/firestore/security/rules-conditions).
Repository/SDK failures are sanitized; contention, exhaustion and unavailability
receive useful 409/429/503 errors without private SDK details.

The existing public phone lookup and customerId-based notification/preferences
endpoints still lack verified customer identity. This is an inherited HTTP API
privacy limitation, not solved by denying direct Firestore access. They remain
compatible for this controlled step; verified customer ownership belongs in the
separate authentication migration before a public production rollout. The old
endpoint remains the service-worker rotation capability. No temporary custom
owner/password/session system was added.

## Query indexes and operational limits

Current SDK queries are scoped collection reads, document reads, root `slug ==`
and root latest `id` ordering. Filtering/joins/ordering are performed in the
repositories to preserve current contracts. They need no composite indexes.
`firestore.indexes.json` therefore has an empty composite list and index
exemptions for push transport keys and internal staff-link metadata.

This compatibility implementation reads complete relevant tenant collections;
the existing response limits are applied afterwards. Subscription lists read
the nested collections of customers in that tenant. It is suitable for validation,
but large tenants need measured query/pagination optimization and corresponding
indexes before scaling. The per-salon lock favors correctness over throughput.
An operation exceeding 450 writes/reservations is rejected atomically with 413;
large campaigns or customer cascades require a separately designed bulk workflow.
Firestore also enforces its SDK transaction time/payload/document-size limits.

Existing scheduled campaigns had no delivery worker; none was invented here.
Push is best-effort after commit. A process failure between commit and delivery
can lose a push, while the notification feed remains persisted. There is no new
durable outbox/retry worker in this step.

Historically, this data-layer step kept PostgreSQL owner and salon identity
records while provisioning starter catalogue/hours/offer data in Firestore for
explicit new signups. It did not import old salons. The two databases could not
share a distributed commit, so provisioning failures could require reconciliation.
That temporary signup arrangement no longer exists: current signup uses Firebase
Auth identity and one Firestore transaction for the profile and salon workspace,
as described in [firebase-auth-migration.md](firebase-auth-migration.md).

## Cleanup and rollback

The original data-layer step temporarily retained PostgreSQL source for rollback.
The authorized cleanup has now removed `src/db/*`, `drizzle.config.json`,
`scripts/seed.mjs`, `scripts/generate-firestore-migration.cjs`, the unused
PostgreSQL/Drizzle dependencies, legacy authentication and `legacy/postgres/*`
source snapshots. No active path uses PostgreSQL; `DATABASE_URL` is not required.
The existing Firestore entities and metadata remain required application code.

Rollback requires a previous complete source checkout or archived deployment
artifact with its matching dependencies and environment, rather than files in
the current tree. Freeze writes, export new Firestore changes for reconciliation,
verify the external historical PostgreSQL database/backups and restore the old
application in an isolated checkout before rebuilding. Source cleanup did not
delete external database records. A code rollback does not copy new Firestore
writes back into PostgreSQL or preserve post-cutover accounts automatically.
No automatic fallback or dual-write system exists.

## Separate data migration and validation

No historic import was run or enabled. Existing PostgreSQL business records will
not appear through the new routes until an explicitly authorized import occurs.

For that separate step: export a read-only consistent PostgreSQL snapshot; stage
records under their original IDs; convert dates with `Timestamp.fromDate`; retain
nullable fields and integer units; group staff mappings into serviceIds/serviceLinks;
place subscriptions under their existing customer; reserve phones, slugs, tokens
and endpoints; initialize counter maxima. Validate parent/child salon ownership,
duplicate IDs/phones/tokens, staff-service pairs and referential integrity before
writing. Import only into the explicitly selected staging project initially.

Compare per-salon/per-entity counts (staff-service rows against serviceLinks),
subscription counts across nested paths, exact ID sets, status totals and timestamp
ranges. Compare each customer's visits/spend/points against PostgreSQL and visit
amount totals, reporting pre-existing differences rather than silently repairing
them. Validate queue projection, history, statistics, booking availability and
notification preferences. Production cutover needs a backup and a write freeze or
an explicitly designed delta procedure; there is no automatic production import.

## Configuration, local commands and deployment

Use `.env.example` placeholders in an ignored `.env.local` or encrypted Vercel
settings. Runtime business access needs `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Firebase Authentication handles
owner credentials/sessions; `DATABASE_URL` is no longer required. The four
`NEXT_PUBLIC_FIREBASE_*` values configure browser Firebase Auth. Never commit a
service-account JSON or paste
secrets into source. Escape PEM newlines as `\n` if the deployment UI needs it.

For explicitly local emulators, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`,
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`,
`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099` and matching client
and server project IDs of `demo-hairq`; Admin credentials are not needed in that mode.
It rejects non-local hosts, live project IDs and NODE_ENV=production. The Firebase
CLI and Java emulator runtime are not application dependencies or installed by
this migration. With those separately available:

```powershell
npx firebase-tools emulators:start --only auth,firestore --project demo-hairq
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

Create the intended Firebase project's default Cloud Firestore database/region,
grant the deployment service account suitable Firestore access, and configure
the server variables. Deploy the committed deny-client rules/indexes explicitly:

```powershell
npx firebase-tools deploy --only "firestore:rules,firestore:indexes" --project YOUR_PROJECT_ID
```

Enable Email/Password and authorized domains only for the separately scheduled
Firebase Authentication switch; doing so does not migrate current users. Keep
FIRESTORE_EMULATOR_HOST unset in Vercel production. Deploy to an isolated preview
environment first, complete the separate import/customer-auth validation and
runtime smoke tests, then authorize production cutover. Nothing was deployed here.

## Verification

The isolated tests exercise repository concurrency/retries, tenant denial,
phone/endpoint uniqueness, queue capacity, booking overlap/rescheduling, completion
and customer totals, booking/queue linkage, cascades, CRUD relationships, API
response contracts, post-commit push counts, credential boundaries and emulator
guards. They use in-memory doubles, not real production records. Real Firestore
emulator/staging and Web Push end-to-end verification remains a deployment gate.

The baseline lint run already had React effect errors in unchanged UI/PWA files.
The foundation test helper's lint issue was fixed. Migration files must pass
targeted lint; unrelated frontend errors are intentionally retained.

## Historical file inventory for this step

Created migration files:

- `src/lib/firestore/entities.ts`
- `src/lib/firestore/fields.ts`
- `src/lib/firestore/public-dto.ts`
- `src/lib/firestore/push-endpoints.ts`
- `src/lib/firestore/query.ts`
- `src/lib/firestore/repositories.ts`
- `src/lib/firestore/schema-metadata.ts`
- `src/lib/firestore/store.ts`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `tests/firestore-repositories.test.mjs`
- `scripts/generate-firestore-migration.cjs`
- `docs/firestore-migration.md`

Modified business/runtime files (originals were temporarily retained under `legacy/postgres`, now removed):

- `src/app/api/auth/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/owner/bookings/route.ts`
- `src/app/api/owner/bookings/[id]/route.ts`
- `src/app/api/owner/campaigns/route.ts`
- `src/app/api/owner/customers/route.ts`
- `src/app/api/owner/customers/[id]/route.ts`
- `src/app/api/owner/queue/route.ts`
- `src/app/api/owner/queue/[id]/route.ts`
- `src/app/api/owner/salon/route.ts`
- `src/app/api/owner/services/route.ts`
- `src/app/api/owner/services/[id]/route.ts`
- `src/app/api/owner/staff/route.ts`
- `src/app/api/owner/staff/[id]/route.ts`
- `src/app/api/owner/summary/route.ts`
- `src/app/api/public/push-resubscribe/route.ts`
- `src/app/api/public/[slug]/book/route.ts`
- `src/app/api/public/[slug]/book/[token]/route.ts`
- `src/app/api/public/[slug]/lookup/route.ts`
- `src/app/api/public/[slug]/notify/route.ts`
- `src/app/api/public/[slug]/queue/route.ts`
- `src/app/api/public/[slug]/queue/[token]/route.ts`
- `src/app/api/public/[slug]/route.ts`
- `src/app/page.tsx`
- `src/app/site/[slug]/page.tsx`
- `src/lib/api-helpers.ts`
- `src/lib/auth.ts`
- `src/lib/onboarding.ts`
- `src/lib/queue-actions.ts`
- `src/lib/salon-data.ts`
- `src/lib/web-push.ts`

Also updated: `package.json` (test command), `src/lib/firebase/admin.ts` (local emulator guard), `tests/firebase-foundation.test.mjs`, `.env.example`, `.gitignore`, and `docs/firebase-foundation.md`. Firebase/Firestore/Admin packages and the lockfile were completed by the foundation installation; this data migration adds no further dependency.

Historical checks for this data-layer step: `npm run typecheck` passed; all 31 `npm test` checks passed; targeted migration lint passed. Full `npm run lint` retained 23 pre-existing React errors and 5 warnings in unchanged frontend/PWA files. That production build used an import-time-only local PostgreSQL placeholder because no real DATABASE_URL was configured in the workspace at that time. No live Firestore/PG import or end-to-end push test was performed in that step. Later Firebase emulator verification is recorded in [firebase-verification.md](firebase-verification.md); the current Firebase-only application does not need a PostgreSQL placeholder.
