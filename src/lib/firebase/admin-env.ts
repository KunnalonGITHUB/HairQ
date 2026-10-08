import "server-only";

import { createPrivateKey } from "node:crypto";

export class FirebaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigurationError";
  }
}

/** Validate only when Admin access is needed, with credential-safe errors. */
export function getFirebaseAdminEnvironment() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const missing = [
    !projectId && "FIREBASE_PROJECT_ID",
    !clientEmail && "FIREBASE_CLIENT_EMAIL",
    !privateKey && "FIREBASE_PRIVATE_KEY",
  ].filter(Boolean);

  if (missing.length) {
    throw new FirebaseConfigurationError(
      `Missing Firebase Admin environment variables: ${missing.join(", ")}. Configure them in .env.local or your deployment environment.`,
    );
  }
  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseConfigurationError("Firebase Admin configuration is incomplete.");
  }
  if (!/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail)) {
    throw new FirebaseConfigurationError("FIREBASE_CLIENT_EMAIL must be a service-account email address.");
  }
  const webProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (webProjectId && webProjectId !== projectId) {
    throw new FirebaseConfigurationError("Firebase client and Admin project IDs must match.");
  }
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== "rsa") {
      throw new Error("Unsupported key type");
    }
  } catch {
    // Do not include the key, its contents, or the underlying parser error.
    throw new FirebaseConfigurationError("FIREBASE_PRIVATE_KEY must be a valid RSA PEM private key.");
  }

  return { projectId, clientEmail, privateKey };
}
