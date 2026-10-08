"use client";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, setPersistence, inMemoryPersistence, signOut } from "firebase/auth";
import { getFirebaseClientAuth } from "./firebase/client";

/** CSRF proof is obtained through a same-origin response, never browser storage. */
export async function authRequestHeaders(): Promise<Record<string, string>> {
  const response = await fetch("/api/auth", { credentials: "same-origin", cache: "no-store" });
  const data = await response.json();
  if (!response.ok || typeof data.csrfToken !== "string") throw new Error("Could not verify your request. Please reload and try again.");
  return { "Content-Type": "application/json", "X-HairQ-CSRF": data.csrfToken };
}
async function exchange(body: Record<string, unknown>): Promise<void> {
  const response = await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: await authRequestHeaders(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not authenticate. Please try again.");
}
function firebaseMessage(error: unknown): string | null {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (!code.startsWith("auth/")) return null;
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) return "That email and password don't match an account.";
  if (code === "auth/weak-password" || code === "auth/password-does-not-meet-requirements") return "Choose a password that meets the account password requirements.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (code === "auth/network-request-failed") return "Could not connect. Check your connection and try again.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  return "Could not authenticate this account. Please try again or contact your administrator.";
}
export async function authenticateHairQ(mode: "login" | "signup", email: string, password: string, profile: {salonName:string;ownerName:string;phone:string;city:string}): Promise<void> {
  if (mode === "signup" && password.length < 8) throw new Error("Use a password with at least 8 characters.");
  const auth = getFirebaseClientAuth();
  try {
    await setPersistence(auth, inMemoryPersistence);
    let credential;
    if (mode === "signup") {
      try { credential = await createUserWithEmailAndPassword(auth, email.trim(), password); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "auth/email-already-in-use")) throw error;
        // Recover an Auth account whose atomic Firestore provisioning failed.
        credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } else credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    await exchange({ action: mode, idToken: await credential.user.getIdToken(), ...(mode === "signup" ? profile : {}) });
  } catch (error) {
    const message = firebaseMessage(error);
    if (message) throw new Error(message);
    throw error;
  } finally {
    // The HttpOnly server cookie is the only persistent authenticated state.
    await signOut(auth).catch(() => undefined);
  }
}
export async function logoutHairQ(): Promise<void> {
  try { await exchange({ action: "logout" }); }
  finally { await signOut(getFirebaseClientAuth()).catch(() => undefined); }
}
