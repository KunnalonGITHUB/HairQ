# Firebase foundation

Firebase is the only active data and authentication system. Business routes use
the server-only Firestore repositories described in
[firestore-migration.md](firestore-migration.md). Email/password identity belongs
to Firebase Authentication; authorization belongs to Firestore `users/{uid}`.
The current cookie flow and operator provisioning requirements are described in
[firebase-auth-migration.md](firebase-auth-migration.md). PostgreSQL runtime,
legacy authentication, configuration, dependencies and source snapshots have
been removed by the authorized cleanup.

## Configuration

Set the seven Firebase variables listed in
`.env.example` to an ignored `.env.local` or deployment environment settings.
The four `NEXT_PUBLIC_FIREBASE_*` values come from the Firebase web app config.
The three unprefixed Admin values are private server credentials. Never commit
a service-account JSON file. `FIREBASE_PRIVATE_KEY` supports escaped `\n` or
actual PEM line breaks. Client and Admin project IDs must match.

Initialization and validation are lazy. Business routes now require Firebase
configuration when requested. A build does not connect to Firestore.
Restart development or rebuild after changing public configuration. Restart the
server after changing Admin credentials; initialized SDK apps cache credentials.

Register a Firebase web app, enable Email/Password Auth, configure authorized
domains, and create Firestore in the intended region. Keep browser Firestore
access denied; this foundation uses the Admin SDK behind server authorization.
These modules require the Next.js Node.js runtime, not Edge. Local Firestore
emulator access is available with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and
a demo- FIREBASE_PROJECT_ID, without Admin secrets. Production rejects emulator
mode. Firebase session-cookie integration is enabled. Local Auth also needs
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` and
`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099`; keep the client and
server project IDs aligned to the same `demo-` project. Never use emulator
variables in production. There is no `DATABASE_URL` requirement.

## Entry points

- Browser Auth: `getFirebaseClientAuth()` from `firebase/client.ts`.
- Server Auth and Firestore: `getFirebaseAdminAuth()` and
  `getFirebaseFirestore()` from `firebase/admin.ts`.
- ID token verification: `verifyFirebaseIdToken()` checks revocation.
- Provisioned account: `getAuthenticatedFirebaseUser()` verifies Firebase
  identity and reads an active, validated `users/{uid}` authorization document.
- Tenant and role guard: `requireFirebaseSalonUser(token, salonId, roles)`.
- Tenant references: `getFirebaseSalonRepository(token, salonId, roles)`.

For example, an owner-only server handler can request a repository with
`getFirebaseSalonRepository(idToken, requestedSalonId, ["owner"])`. A customer
role never passes this operator guard. Active protected routes use the shared
Firebase session/profile guard; provisioning, transactions and business schemas
are implemented separately from these SDK initialization helpers. Existing staff
job titles are not authorization roles. The public customer ownership gap
recorded in [firebase-verification.md](firebase-verification.md) remains a
production privacy blocker; this cleanup does not change business behavior.

Raw Admin helpers are privileged infrastructure, not authorization boundaries.
Every caller must perform authorization before reading or writing private business
data. Firestore rules do not restrict Admin SDK access. Do not return raw SDK
errors or authorization documents to public endpoints.

`firebase/types.ts` contains foundation metadata and user authorization types.
SDK initialization helpers contain no CRUD logic or password handling. Firebase
Authentication alone handles passwords; business repositories contain the
operational algorithms.

## Local commands

Dependencies are recorded in `package-lock.json`. On a fresh checkout run
`npm ci`, then `npm run typecheck`, `npm run lint`, and `npm run build`.
Run focused foundation checks with `node --test tests/firebase-foundation.test.mjs`.
Start the application with `npm run dev` and configured Firebase Auth/Firestore.
Historical business records require a separately authorized import before they
appear in Firestore; removing old source does not import or delete database data.
Run all isolated foundation/repository checks with `npm test`.
