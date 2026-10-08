# HairQ Firebase and Vercel setup

The local web configuration is set to Firebase project `hairq-10304` in ignored `.env.local`. Client Auth and server Admin/Firestore use the same project ID. The supplied bucket, sender ID and measurement ID are also passed to Firebase initialization; this does not enable new Storage, Analytics or Messaging features.

**Live server access is not yet configured:** `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are intentionally blank. The public Firebase config cannot authenticate Admin requests. Add the service-account credentials locally and in Vercel's environment settings; never paste private keys into chat, commit JSON credentials or prefix them with `NEXT_PUBLIC_`.

## Vercel environment variables

Use the supplied Firebase web configuration for the public values. `.env.example` lists names with blank values only; do not upload `.env.local` into Git.

| Variable | Value source / purpose | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Supplied web config `apiKey` | Yes |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Supplied web config `authDomain` | Yes |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `hairq-10304` | Yes |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Supplied web config `appId` | Yes |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Supplied web config `storageBucket` | Optional; already configured locally |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Supplied web config `messagingSenderId` | Optional; already configured locally |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Supplied web config `measurementId` | Optional; already configured locally |
| `FIREBASE_PROJECT_ID` | `hairq-10304`; same as browser project | Yes, server only |
| `FIREBASE_CLIENT_EMAIL` | Authorized service-account email | Yes, server only |
| `FIREBASE_PRIVATE_KEY` | That account's RSA PEM private key | Yes, server only; sensitive |
| `HAIRQ_APP_ORIGIN` | Exact HTTPS origin of that deployment, without a path | Recommended for explicit origin validation |
| `VAPID_PUBLIC_KEY` | Stable existing Web Push public key | Required for Web Push |
| `VAPID_PRIVATE_KEY` | Matching stable Web Push private key | Required for Web Push; server only, sensitive |
| `VAPID_SUBJECT` | Operator-controlled contact URI for push | Configure for Web Push |

The app accepts real multiline PEM keys or escaped newline sequences. In Vercel, enter the key value itself without surrounding environment-file quotes. The existing ignored `.vapid.json` keypair was validated and reused in ignored `.env.local`; securely copy those same values into Vercel. Preserve an existing VAPID keypair if subscriptions already exist; rotating it breaks those subscriptions. No VAPID keypair was generated or replaced in this setup.

Scope variables to Production and any intended Preview environment. If `HAIRQ_APP_ORIGIN` is set for Preview, it must match that preview domain rather than the production domain. When unset, the existing Host-based origin validation remains active. Set public Firebase configuration before the build; changes require a new deployment because Next.js inlines `NEXT_PUBLIC_` values.

Do **not** set `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` or `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` in Vercel. No `DATABASE_URL` is needed.

## Firebase Console steps

1. Select project `hairq-10304`; enable Authentication's Email/Password provider.
2. Under Authentication settings, add the actual Vercel/custom hostnames to authorized domains. Add `localhost` for local browser testing if absent.
3. Create the default `(default)` Firestore database if needed. Keep direct client access denied. Publish this repository's `firestore.rules` and `firestore.indexes.json` explicitly to this project; do not open client permissions to work around server configuration.
4. Provide an authorized service account. It needs Firestore data read/write and Firebase Auth account/session operations; appropriate product roles include Cloud Datastore User and Firebase Authentication Admin. Configure email/private key through ignored local environment and sensitive Vercel variables.

Rules/indexes are not deployed by a Next.js build. No Console settings, rules or deployment were changed automatically.

## Vercel project settings

- Framework preset: Next.js.
- Root directory: repository root.
- Node.js: 24.x, matching the verified local toolchain.
- Install command: `npm ci` (or Vercel's package-lock detection).
- Build command: `npm run build`.
- Output and function runtime: Next.js defaults. Existing APIs use Node, not Edge; no extra `vercel.json` is required.

Admin modules remain server-only and private API responses remain uncached. No UI or business behavior was changed. The earlier [customer ownership/privacy blocker](firebase-verification.md) is unchanged and must be resolved before public production release.

## Local validation

The public configuration is populated and project IDs align. Server credential validation remains lazy and fails safely if the missing credentials are not added. A successful build does not prove live Firestore permissions or Firebase Auth provisioning.

- `npm run typecheck`: passed.
- `npm run build`: passed with `.env.local` loaded; API/dashboard routes remain dynamic.
- Firebase foundation tests: all 12 passed.

Focused Firebase client lint passed. The completed build's 30 client JavaScript files were checked for actual configured private values and server-only references; none were found. Git ignores `.env.local`, the existing VAPID file and service-account patterns, and no credential files are tracked. No Firebase Admin credentials were available, so live Firestore access and server Auth operations remain unverified.

After supplying Admin credentials and completing Console configuration, restart `npm run dev`, verify the health endpoint and test signup/login/logout plus a Firestore write in an approved staging/test salon. No live data or accounts were created by this setup.

Official references: [Firebase Admin setup](https://firebase.google.com/docs/admin/setup), [Email/Password Auth](https://firebase.google.com/docs/auth/web/password-auth), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables), [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
