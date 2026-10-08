import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { FirebaseConfigurationError, getFirebaseAdminEnvironment } from "./admin-env";

const APP_NAME = "hairq-admin";

/** The SDK's app registry survives repeated imports and Next.js hot reload. */
export function getFirebaseAdminApp(): App {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
  const emulatorProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (authEmulatorHost && (process.env.NODE_ENV === "production" || !/^(localhost|127\.0\.0\.1):\d+$/.test(authEmulatorHost) || !emulatorHost || !process.env.FIREBASE_PROJECT_ID?.startsWith("demo-"))) {
    throw new FirebaseConfigurationError("Firebase Auth emulator access requires local development with a demo project and local Firestore emulator.");
  }
  if (emulatorHost && (process.env.NODE_ENV === "production" || !/^(localhost|127\.0\.0\.1):\d+$/.test(emulatorHost))) {
    throw new FirebaseConfigurationError("Firestore emulator access is restricted to local development.");
  }
  if (emulatorHost && !emulatorProjectId?.startsWith("demo-")) throw new FirebaseConfigurationError("Local Firestore emulator mode requires a demo- FIREBASE_PROJECT_ID.");
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  // Explicit localhost emulator mode requires no service-account secret.
  // A demo project and a production guard prevent accidental live-data access.
  if (emulatorHost) {
    return initializeApp({ projectId: emulatorProjectId }, APP_NAME);
  }

  const environment = getFirebaseAdminEnvironment();
  try {
    return initializeApp(
      { credential: cert(environment), projectId: environment.projectId },
      APP_NAME,
    );
  } catch {
    throw new FirebaseConfigurationError("Unable to initialize Firebase Admin. Check the server environment configuration.");
  }
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
