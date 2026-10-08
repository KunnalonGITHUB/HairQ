import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "./firebase/admin";
import { FirebaseAccessError, getAuthenticatedFirebaseUser } from "./firebase/auth";
import { findFirebaseUser } from "./firebase/repositories/users";
import { getSalonById } from "./salon-data";

export const SESSION_COOKIE = "hq_firebase_session";
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
export const OPERATOR_ROLES = ["owner", "manager", "front_desk"] as const;
export type SessionUser = { uid: string; ownerId: number | null; name: string; email: string; role: string; salonId: number; salonName: string; salonSlug: string };
// Queue/booking capability tokens are unrelated to authentication.
export function newToken(size = 24): string { return randomBytes(size).toString("base64url"); }
async function authorizedUser(uid: string): Promise<SessionUser> {
  const profile = await findFirebaseUser(uid);
  if (!profile?.active || !OPERATOR_ROLES.some(role => role === profile.role)) throw new FirebaseAccessError("This account has no active salon authorization. Contact your salon administrator.", 403);
  const salonId = Number(profile.salonId);
  if (!Number.isSafeInteger(salonId) || salonId < 1 || String(salonId) !== profile.salonId) throw new FirebaseAccessError("Salon access denied.", 403);
  const salon = await getSalonById(salonId);
  if (!salon) throw new FirebaseAccessError("Salon access denied.", 403);
  return { uid, ownerId: profile.legacyOwnerId ?? null, name: profile.name, email: profile.email, role: profile.role, salonId, salonName: salon.name, salonSlug: salon.slug };
}
export function requireRecentSignIn(token: DecodedIdToken): void {
  const age = Date.now() / 1000 - token.auth_time;
  if (!Number.isFinite(age) || age > 300 || age < -60 || token.firebase?.sign_in_provider !== "password") throw new FirebaseAccessError("Please sign in again using email and password.", 401);
}
export async function createSession(idToken: string): Promise<SessionUser> {
  const authenticated = await getAuthenticatedFirebaseUser(idToken);
  requireRecentSignIn(authenticated.token);
  const user = await authorizedUser(authenticated.token.uid);
  const value = await getFirebaseAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MS / 1000 });
  jar.delete("hq_session");
  return user;
}
function invalidCredential(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return ["auth/argument-error", "auth/invalid-session-cookie", "auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/user-disabled", "auth/user-not-found", "auth/invalid-id-token", "auth/id-token-expired"].includes(code);
}
export async function getSessionUser(): Promise<SessionUser | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  let token: DecodedIdToken;
  const auth = getFirebaseAdminAuth();
  try { token = await auth.verifySessionCookie(value, true); }
  catch (error) { if (invalidCredential(error)) return null; throw error; }
  return authorizedUser(token.uid);
}
export async function getPageSessionUser(): Promise<SessionUser | null> {
  try { return await getSessionUser(); }
  catch (error) { if (error instanceof FirebaseAccessError) return null; throw error; }
}
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  try {
    if (value) {
      const auth = getFirebaseAdminAuth();
      let token: DecodedIdToken | null = null;
      try { token = await auth.verifySessionCookie(value, true); }
      catch (error) { if (!invalidCredential(error)) throw error; }
      if (token) await auth.revokeRefreshTokens(token.uid);
    }
  } finally { jar.delete(SESSION_COOKIE); jar.delete("hq_session"); }
}
export class UnauthorizedError extends Error { constructor() { super("Not signed in"); this.name = "UnauthorizedError"; } }
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
