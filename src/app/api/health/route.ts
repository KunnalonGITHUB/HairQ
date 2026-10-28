import { getFirebaseAdminAuth, getFirebaseFirestore } from "@/lib/firebase/admin";
import { FirebaseConfigurationError } from "@/lib/firebase/admin-env";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; reason?: string; fix?: string };

/**
 * Maps Firebase/Google errors to safe, actionable explanations.
 * Never returns raw error text, credentials or project data.
 */
function explain(error: unknown): Check {
  if (error instanceof FirebaseConfigurationError) {
    // These messages are written to be credential-safe (variable names only).
    return {
      ok: false,
      reason: error.message,
      fix: "Set the server-only Firebase Admin variables in .env.local, then restart `npm run dev`.",
    };
  }
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (/invalid_grant|invalid_client|account not found/i.test(message)) {
    return {
      ok: false,
      reason: "Google rejected the service-account key.",
      fix: "The key may be deleted or from another account, or this computer's clock may be wrong. Generate a new key and update .env.local.",
    };
  }
  if (code === "7" || code === "permission-denied" || /PERMISSION_DENIED/i.test(message)) {
    return {
      ok: false,
      reason: "The service account does not have permission to use Firestore, or the Firestore API is disabled.",
      fix: "In Google Cloud IAM give the service account the Cloud Datastore User role, and make sure the Cloud Firestore API is enabled.",
    };
  }
  if (code === "16" || code === "unauthenticated") {
    return { ok: false, reason: "Firestore did not accept the service-account credentials.", fix: "Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY come from the same key file." };
  }
  if (code === "5" || code === "not-found") {
    return { ok: false, reason: "No Firestore database was found for this project.", fix: "Create the (default) Firestore database in the Firebase Console." };
  }
  if (code === "auth/insufficient-permission") {
    return { ok: false, reason: "The service account cannot manage Firebase Authentication.", fix: "Give it the Firebase Authentication Admin role." };
  }
  if (code === "auth/configuration-not-found") {
    return { ok: false, reason: "Firebase Authentication is not set up for this project.", fix: "Open Authentication in the Firebase Console, click Get started and enable Email/Password." };
  }
  if (["4", "14", "deadline-exceeded", "unavailable"].includes(code) || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(message)) {
    return { ok: false, reason: "Could not reach Firebase.", fix: "Check this computer's internet connection or firewall." };
  }
  return { ok: false, reason: "Unexpected Firebase error.", fix: "Check the dev server terminal for details." };
}

export async function GET() {
  let firestore: Check;
  try {
    await getFirebaseFirestore().collection("salons").limit(1).get();
    firestore = { ok: true };
  } catch (error) {
    firestore = explain(error);
  }

  // Production keeps the minimal public contract: no configuration details.
  if (process.env.NODE_ENV === "production") {
    return Response.json({ ok: firestore.ok }, { status: firestore.ok ? 200 : 500 });
  }

  // Owner sign-in needs Admin access to Firebase Authentication (read-only probe).
  let auth: Check = { ok: false, reason: "Skipped until Firestore works." };
  if (firestore.ok) {
    try {
      await getFirebaseAdminAuth().listUsers(1);
      auth = { ok: true };
    } catch (error) {
      auth = explain(error);
    }
  }

  return Response.json(
    { ok: firestore.ok, firestore, auth },
    { status: firestore.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
