import "server-only";

import { createPrivateKey } from "node:crypto";

export class FirebaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigurationError";
  }
}

/**
 * Values pasted from a service-account JSON file or into a hosting dashboard
 * often keep their surrounding quotes. Remove one matching pair.
 */
function unquote(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length >= 2 && /^(["'])[\s\S]*\1$/.test(trimmed)) return trimmed.slice(1, -1).trim();
  return trimmed;
}

/** Accepts real PEM line breaks, escaped \n (or \r\n) sequences and Windows line endings. */
function normalizePrivateKey(value: string | undefined): string | undefined {
  return unquote(value)
    ?.replace(/\\r\\n|\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Validate only when Admin access is needed, with credential-safe errors. */
export function getFirebaseAdminEnvironment() {
  const projectId = unquote(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = unquote(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
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
  const webProjectId = unquote(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
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
