import type { Timestamp } from "firebase-admin/firestore";

/** Authorization roles, separate from a staff member's descriptive job title. */
export type FirebaseOperatorRole = "owner" | "manager" | "front_desk";
export type FirebaseUserRole = FirebaseOperatorRole | "customer";

export interface FirebaseUserDocument {
  uid: string;
  email: string;
  name: string;
  role: FirebaseUserRole;
  salonId: string | null;
  staffId: string | null;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  legacyOwnerId?: number | null;
}

/** Shared metadata only; business entity schemas will accompany migration. */
export interface FirestoreTenantDocument {
  salonId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  legacyId?: number | null;
}

export type SalonCollectionName =
  | "workingHours"
  | "services"
  | "staff"
  | "customers"
  | "queue"
  | "bookings"
  | "visits"
  | "offers"
  | "campaigns"
  | "notifications";
