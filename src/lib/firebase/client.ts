"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

const APP_NAME = "hairq-client";

/** Only public web configuration is read here; Admin modules stay server-only. */
export function getFirebaseClientApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase client initialization must run in the browser.");
  }
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;

  // Explicit property accesses are required for Next.js build-time inlining.
  const configuration = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
  };
  const missing = [
    !configuration.apiKey && "NEXT_PUBLIC_FIREBASE_API_KEY",
    !configuration.authDomain && "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    !configuration.projectId && "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    !configuration.appId && "NEXT_PUBLIC_FIREBASE_APP_ID",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing Firebase client environment variables: ${missing.join(", ")}. Configure them and restart or rebuild Next.js.`);
  }
  return initializeApp(configuration, APP_NAME);
}

export function getFirebaseClientAuth(): Auth {
  const app = getFirebaseClientApp();
  const emulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim();
  if (emulatorUrl && (process.env.NODE_ENV === "production" || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(emulatorUrl) || !app.options.projectId?.startsWith("demo-"))) {
    throw new Error("Firebase Auth emulator access requires a localhost development demo project.");
  }
  const auth = getAuth(app);
  if (emulatorUrl && !auth.emulatorConfig) connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  return auth;
}
