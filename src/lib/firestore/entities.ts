/* Schema-compatible API DTOs. Stored dates use Firestore Timestamp; repositories decode to Date. */
import type { Timestamp } from "firebase-admin/firestore";

export interface Salon {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  brandColor: string;
  brandInk: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagram: string | null;
  pwaName: string | null;
  pwaShortName: string | null;
  pwaThemeColor: string | null;
  customDomain: string | null;
  websiteEnabled: boolean;
  queueStatus: string;
  maxQueueSize: number;
  acceptingBookings: boolean;
  bookingHorizonDays: number;
  slotIntervalMin: number;
  allowServiceChange: boolean;
  currency: string;
  plan: string;
  createdAt: Date;
}

export interface WorkingHour {
  id: number;
  salonId: number;
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface Service {
  id: number;
  salonId: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  durationMin: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface Staff {
  id: number;
  salonId: number;
  name: string;
  role: string;
  photoUrl: string | null;
  bio: string | null;
  active: boolean;
  onShift: boolean;
  shiftStart: string;
  shiftEnd: string;
  createdAt: Date;
}

export interface StaffService {
  id: number;
  salonId: number;
  staffId: number;
  serviceId: number;
}

export interface Customer {
  id: number;
  salonId: number;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  preferredStaffId: number | null;
  totalVisits: number;
  totalSpend: number;
  loyaltyPoints: number;
  lastVisitAt: Date | null;
  lastActivityAt: Date | null;
  lastServiceId: number | null;
  pwaInstalled: boolean;
  source: string;
  birthday: string | null;
  createdAt: Date;
}

export interface PushSubscription {
  id: number;
  salonId: number;
  customerId: number;
  deviceLabel: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  invalidAt: Date | null;
  lastPushAt: Date | null;
  queueOptIn: boolean;
  bookingOptIn: boolean;
  marketingOptIn: boolean;
  permission: string;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface QueueEntry {
  id: number;
  salonId: number;
  customerId: number;
  serviceId: number;
  staffId: number | null;
  token: string;
  status: string;
  position: number;
  durationMin: number;
  source: string;
  chair: string | null;
  notes: string | null;
  notifiedStage: string | null;
  joinedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface Booking {
  id: number;
  salonId: number;
  customerId: number;
  serviceId: number;
  staffId: number | null;
  token: string;
  scheduledAt: Date;
  durationMin: number;
  status: string;
  source: string;
  notes: string | null;
  createdAt: Date;
  /** Services added when the appointment was completed (null until then). */
  extraServices: BookingExtraService[] | null;
  /** Booked service price plus extras, recorded once at completion. */
  finalAmount: number | null;
}

/** serviceId is null for a custom service typed in by the owner. */
export interface BookingExtraService {
  serviceId: number | null;
  name: string;
  price: number;
}

export interface Visit {
  id: number;
  salonId: number;
  customerId: number;
  serviceId: number | null;
  staffId: number | null;
  source: string;
  amount: number;
  durationMin: number;
  waitMin: number;
  completedAt: Date;
}

export interface Offer {
  id: number;
  salonId: number;
  title: string;
  description: string | null;
  badge: string | null;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
}

export interface Campaign {
  id: number;
  salonId: number;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  segment: string;
  type: string;
  status: string;
  audienceCount: number;
  openCount: number;
  scheduledFor: Date | null;
  sentAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface NotificationRow {
  id: number;
  salonId: number;
  customerId: number;
  campaignId: number | null;
  channel: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  deliveredAt: Date;
  readAt: Date | null;
}

export interface EntityMap {
  salons: Salon;
  workingHours: WorkingHour;
  services: Service;
  staff: Staff;
  staffServices: StaffService;
  customers: Customer;
  pushSubscriptions: PushSubscription;
  queueEntries: QueueEntry;
  bookings: Booking;
  visits: Visit;
  offers: Offer;
  campaigns: Campaign;
  notifications: NotificationRow;
}
export type EntityName = keyof EntityMap;
export type Stored<T> = { [K in keyof T]: T[K] extends Date ? Timestamp : T[K] extends Date | null ? Timestamp | null : T[K] };
export type QueueStatus = "waiting" | "serving" | "completed" | "cancelled" | "skipped" | "no_show";
export type BookingStatus = "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";

export type FirestoreUserDocument = import("../firebase/types").FirebaseUserDocument;
export type FirestoreStaffDocument = Stored<Staff> & {
  serviceIds: number[];
  serviceLinks: { id: number; serviceId: number }[];
};
export type FirestoreQueueDocument = Stored<QueueEntry> & { bookingId?: number };
export type FirestoreBookingDocument = Stored<Booking> & { queueId?: number };
export interface TenantStateDocument {
  counters: Partial<Record<EntityName, number>>;
  updatedAt: Timestamp;
}
