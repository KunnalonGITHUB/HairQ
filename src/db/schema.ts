import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* TENANT: SALON                                                               */
/* -------------------------------------------------------------------------- */

export const salons = pgTable(
  "salons",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    about: text("about"),
    logoUrl: text("logo_url"),
    heroImageUrl: text("hero_image_url"),
    brandColor: text("brand_color").notNull().default("#B4542A"),
    brandInk: text("brand_ink").notNull().default("#17120F"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    address: text("address"),
    mapsUrl: text("maps_url"),
    instagram: text("instagram"),
    // White label / PWA
    pwaName: text("pwa_name"),
    pwaShortName: text("pwa_short_name"),
    pwaThemeColor: text("pwa_theme_color"),
    customDomain: text("custom_domain"),
    websiteEnabled: boolean("website_enabled").notNull().default(true),
    // Queue + booking configuration
    queueStatus: text("queue_status").notNull().default("open"), // open | paused | closed
    maxQueueSize: integer("max_queue_size").notNull().default(20),
    acceptingBookings: boolean("accepting_bookings").notNull().default(true),
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(14),
    slotIntervalMin: integer("slot_interval_min").notNull().default(15),
    allowServiceChange: boolean("allow_service_change").notNull().default(true),
    currency: text("currency").notNull().default("INR"),
    plan: text("plan").notNull().default("growth"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("salons_slug_idx").on(t.slug)],
);

export const owners = pgTable(
  "owners",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("owner"), // owner | manager | front_desk
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("owners_email_idx").on(t.email)],
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const workingHours = pgTable(
  "working_hours",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday
    isClosed: boolean("is_closed").notNull().default(false),
    openTime: text("open_time").notNull().default("10:00"),
    closeTime: text("close_time").notNull().default("21:00"),
    breakStart: text("break_start"),
    breakEnd: text("break_end"),
  },
  (t) => [uniqueIndex("working_hours_salon_day_idx").on(t.salonId, t.dayOfWeek)],
);

/* -------------------------------------------------------------------------- */
/* CATALOGUE                                                                   */
/* -------------------------------------------------------------------------- */

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("Hair"),
    price: integer("price").notNull().default(0),
    durationMin: integer("duration_min").notNull().default(30),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("services_salon_idx").on(t.salonId)],
);

export const staff = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("Barber"),
    photoUrl: text("photo_url"),
    bio: text("bio"),
    active: boolean("active").notNull().default(true),
    onShift: boolean("on_shift").notNull().default(true),
    shiftStart: text("shift_start").notNull().default("10:00"),
    shiftEnd: text("shift_end").notNull().default("21:00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_salon_idx").on(t.salonId)],
);

export const staffServices = pgTable(
  "staff_services",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    staffId: integer("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("staff_services_pair_idx").on(t.staffId, t.serviceId)],
);

/* -------------------------------------------------------------------------- */
/* PEOPLE                                                                      */
/* -------------------------------------------------------------------------- */

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    notes: text("notes"),
    preferredStaffId: integer("preferred_staff_id"),
    totalVisits: integer("total_visits").notNull().default(0),
    totalSpend: integer("total_spend").notNull().default(0),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    lastServiceId: integer("last_service_id"),
    pwaInstalled: boolean("pwa_installed").notNull().default(false),
    source: text("source").notNull().default("walk_in"), // queue | booking | walk_in | manual
    birthday: text("birthday"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_salon_phone_idx").on(t.salonId, t.phone)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    deviceLabel: text("device_label").notNull().default("Browser"),
    endpoint: text("endpoint"),
    // Web Push (VAPID) transport keys. Nullable so records created before a
    // browser subscription exists (or legacy rows) keep working.
    p256dh: text("p256dh"),
    auth: text("auth"),
    // Set when the push service reports the endpoint is gone (404/410).
    invalidAt: timestamp("invalid_at", { withTimezone: true }),
    lastPushAt: timestamp("last_push_at", { withTimezone: true }),
    queueOptIn: boolean("queue_opt_in").notNull().default(true),
    bookingOptIn: boolean("booking_opt_in").notNull().default(true),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    permission: text("permission").notNull().default("granted"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subs_customer_idx").on(t.customerId)],
);

/* -------------------------------------------------------------------------- */
/* OPERATIONS                                                                  */
/* -------------------------------------------------------------------------- */

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    staffId: integer("staff_id"),
    token: text("token").notNull(),
    status: text("status").notNull().default("waiting"), // waiting | serving | completed | cancelled | skipped | no_show
    position: integer("position").notNull().default(0),
    durationMin: integer("duration_min").notNull().default(30),
    source: text("source").notNull().default("online"), // online | walk_in | booking
    chair: text("chair"),
    notes: text("notes"),
    notifiedStage: text("notified_stage"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("queue_token_idx").on(t.token),
    index("queue_salon_status_idx").on(t.salonId, t.status),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    staffId: integer("staff_id"),
    token: text("token").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(30),
    status: text("status").notNull().default("confirmed"), // confirmed | arrived | completed | cancelled | no_show
    source: text("source").notNull().default("online"), // online | manual
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_token_idx").on(t.token),
    index("bookings_salon_time_idx").on(t.salonId, t.scheduledAt),
  ],
);

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: integer("service_id"),
    staffId: integer("staff_id"),
    source: text("source").notNull().default("queue"), // queue | booking | walk_in
    amount: integer("amount").notNull().default(0),
    durationMin: integer("duration_min").notNull().default(0),
    waitMin: integer("wait_min").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("visits_salon_time_idx").on(t.salonId, t.completedAt)],
);

/* -------------------------------------------------------------------------- */
/* ENGAGEMENT                                                                  */
/* -------------------------------------------------------------------------- */

export const offers = pgTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    badge: text("badge"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("offers_salon_idx").on(t.salonId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageUrl: text("image_url"),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    segment: text("segment").notNull().default("all_opted_in"),
    type: text("type").notNull().default("marketing"), // marketing | transactional
    status: text("status").notNull().default("sent"), // draft | scheduled | sent
    audienceCount: integer("audience_count").notNull().default(0),
    openCount: integer("open_count").notNull().default(0),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_salon_idx").on(t.salonId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    salonId: integer("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id"),
    channel: text("channel").notNull().default("push"),
    type: text("type").notNull().default("queue"), // queue | booking | marketing
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_customer_idx").on(t.customerId)],
);

export type Salon = typeof salons.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type WorkingHour = typeof workingHours.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type Visit = typeof visits.$inferSelect;
