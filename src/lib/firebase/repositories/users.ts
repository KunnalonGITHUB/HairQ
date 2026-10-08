import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseFirestore } from "../admin";
import type { FirebaseUserDocument, FirebaseUserRole } from "../types";
import { assertDocumentId } from "./paths";

const ROLES: readonly FirebaseUserRole[] = ["owner", "manager", "front_desk", "customer"];

/** Fail closed: unvalidated Firestore data must never authorize a request. */
export async function findFirebaseUser(uid: string): Promise<FirebaseUserDocument | null> {
  assertDocumentId(uid);
  const snapshot = await getFirebaseFirestore().collection("users").doc(uid).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  const validSalonId = data.salonId === null || isDocumentId(data.salonId);
  const validStaffId = data.staffId === null || isDocumentId(data.staffId);
  if (
    data.uid !== uid ||
    typeof data.email !== "string" || !data.email.trim() ||
    typeof data.name !== "string" || !data.name.trim() ||
    !ROLES.includes(data.role) ||
    typeof data.active !== "boolean" ||
    !validSalonId || !validStaffId ||
    (data.role !== "customer" && data.salonId === null) ||
    !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp) ||
    (data.legacyOwnerId != null && (!Number.isSafeInteger(data.legacyOwnerId) || data.legacyOwnerId < 1))
  ) {
    throw new Error("Firebase user authorization document is invalid.");
  }
  return {
    uid,
    email: data.email,
    name: data.name,
    role: data.role,
    salonId: data.salonId,
    staffId: data.staffId,
    active: data.active,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    legacyOwnerId: data.legacyOwnerId ?? null,
  };
}

function isDocumentId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { assertDocumentId(value); return true; } catch { return false; }
}
