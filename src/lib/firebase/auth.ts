import "server-only";

import type { DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { getFirebaseAdminAuth } from "./admin";
import { findFirebaseUser } from "./repositories/users";
import { assertDocumentId } from "./repositories/paths";
import type { FirebaseOperatorRole, FirebaseUserDocument, FirebaseUserRole } from "./types";

export class FirebaseAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
    this.name = "FirebaseAccessError";
  }
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  if (typeof idToken !== "string" || !idToken.trim()) {
    throw new FirebaseAccessError("A Firebase ID token is required.", 401);
  }
  // Initialize outside the catch so missing configuration remains actionable.
  const auth = getFirebaseAdminAuth();
  try {
    return await auth.verifyIdToken(idToken, true);
  } catch {
    throw new FirebaseAccessError("The Firebase ID token is invalid, expired, or revoked.", 401);
  }
}

export interface AuthenticatedFirebaseUser {
  token: DecodedIdToken;
  user: UserRecord;
  profile: FirebaseUserDocument;
}

/** Verify identity before loading server-controlled authorization. */
export async function getAuthenticatedFirebaseUser(idToken: string): Promise<AuthenticatedFirebaseUser> {
  const token = await verifyFirebaseIdToken(idToken);
  let user: UserRecord;
  try {
    user = await getFirebaseAdminAuth().getUser(token.uid);
  } catch {
    throw new FirebaseAccessError("The Firebase account could not be authenticated.", 401);
  }
  if (user.disabled) throw new FirebaseAccessError("This Firebase account is disabled.", 403);
  const profile = await findFirebaseUser(token.uid);
  if (!profile || !profile.active) {
    throw new FirebaseAccessError("This Firebase account has no active HairQ authorization.", 403);
  }
  return { token, user, profile };
}

export function requireFirebaseRole(
  authenticated: AuthenticatedFirebaseUser,
  allowedRoles: readonly FirebaseUserRole[],
): void {
  if (!authenticated.profile.active || !allowedRoles.includes(authenticated.profile.role)) {
    throw new FirebaseAccessError("Your role does not permit this operation.", 403);
  }
}

export interface FirebaseSalonAccess {
  readonly uid: string;
  readonly salonId: string;
  readonly role: FirebaseOperatorRole;
}

export async function requireFirebaseSalonUser(
  idToken: string,
  salonId: string,
  allowedRoles: readonly FirebaseOperatorRole[],
): Promise<FirebaseSalonAccess> {
  assertDocumentId(salonId);
  const authenticated = await getAuthenticatedFirebaseUser(idToken);
  requireFirebaseRole(authenticated, allowedRoles);
  const { profile } = authenticated;
  if (profile.role === "customer" || profile.salonId !== salonId) {
    throw new FirebaseAccessError("You are not authorized to access this salon.", 403);
  }
  return { uid: profile.uid, salonId, role: profile.role };
}
