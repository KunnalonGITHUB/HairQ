import "server-only";

import { getFirebaseFirestore } from "../admin";
import { requireFirebaseSalonUser } from "../auth";
import type { FirebaseOperatorRole, SalonCollectionName } from "../types";
import { assertDocumentId } from "./paths";

const COLLECTIONS: readonly SalonCollectionName[] = [
  "workingHours", "services", "staff", "customers", "queue", "bookings",
  "visits", "offers", "campaigns", "notifications",
];

function assertCollectionName(name: SalonCollectionName): void {
  if (!COLLECTIONS.includes(name)) throw new Error("Unknown salon collection.");
}

/**
 * Authorized Firestore references only. Business repositories must validate
 * fields and relationships before performing mutations.
 */
export async function getFirebaseSalonRepository(
  idToken: string,
  salonId: string,
  allowedRoles: readonly FirebaseOperatorRole[],
) {
  const access = await requireFirebaseSalonUser(idToken, salonId, allowedRoles);
  const salon = getFirebaseFirestore().collection("salons").doc(access.salonId);
  return {
    access,
    salon,
    collection(name: SalonCollectionName) {
      assertCollectionName(name);
      return salon.collection(name);
    },
    document(name: SalonCollectionName, id: string) {
      assertCollectionName(name);
      assertDocumentId(id);
      return salon.collection(name).doc(id);
    },
    pushSubscriptions(customerId: string) {
      assertDocumentId(customerId);
      return salon.collection("customers").doc(customerId).collection("pushSubscriptions");
    },
  };
}
