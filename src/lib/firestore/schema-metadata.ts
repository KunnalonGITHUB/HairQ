/* Firestore field defaults and nullability for HairQ business entities. */
import type { EntityName } from "./entities";
export const metadata = {
  "salons": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "slug",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "name",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "tagline",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "about",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "logoUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "heroImageUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "brandColor",
      "kind": "text",
      "nullable": false,
      "default": "\"#B4542A\"",
      "now": false
    },
    {
      "name": "brandInk",
      "kind": "text",
      "nullable": false,
      "default": "\"#17120F\"",
      "now": false
    },
    {
      "name": "phone",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "whatsapp",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "email",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "address",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "mapsUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "instagram",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "pwaName",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "pwaShortName",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "pwaThemeColor",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "customDomain",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "websiteEnabled",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "queueStatus",
      "kind": "text",
      "nullable": false,
      "default": "\"open\"",
      "now": false
    },
    {
      "name": "maxQueueSize",
      "kind": "integer",
      "nullable": false,
      "default": "20",
      "now": false
    },
    {
      "name": "acceptingBookings",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "bookingHorizonDays",
      "kind": "integer",
      "nullable": false,
      "default": "14",
      "now": false
    },
    {
      "name": "slotIntervalMin",
      "kind": "integer",
      "nullable": false,
      "default": "30",
      "now": false
    },
    {
      "name": "allowServiceChange",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "currency",
      "kind": "text",
      "nullable": false,
      "default": "\"INR\"",
      "now": false
    },
    {
      "name": "plan",
      "kind": "text",
      "nullable": false,
      "default": "\"growth\"",
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "workingHours": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "dayOfWeek",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "isClosed",
      "kind": "boolean",
      "nullable": false,
      "default": "false",
      "now": false
    },
    {
      "name": "openTime",
      "kind": "text",
      "nullable": false,
      "default": "\"10:00\"",
      "now": false
    },
    {
      "name": "closeTime",
      "kind": "text",
      "nullable": false,
      "default": "\"21:00\"",
      "now": false
    },
    {
      "name": "breakStart",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "breakEnd",
      "kind": "text",
      "nullable": true,
      "now": false
    }
  ],
  "services": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "name",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "description",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "category",
      "kind": "text",
      "nullable": false,
      "default": "\"Hair\"",
      "now": false
    },
    {
      "name": "price",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "durationMin",
      "kind": "integer",
      "nullable": false,
      "default": "30",
      "now": false
    },
    {
      "name": "active",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "sortOrder",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "staff": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "name",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "role",
      "kind": "text",
      "nullable": false,
      "default": "\"Barber\"",
      "now": false
    },
    {
      "name": "photoUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "bio",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "active",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "onShift",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "shiftStart",
      "kind": "text",
      "nullable": false,
      "default": "\"10:00\"",
      "now": false
    },
    {
      "name": "shiftEnd",
      "kind": "text",
      "nullable": false,
      "default": "\"21:00\"",
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "staffServices": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "staffId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "serviceId",
      "kind": "integer",
      "nullable": false,
      "now": false
    }
  ],
  "customers": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "name",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "phone",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "email",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "notes",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "preferredStaffId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "totalVisits",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "totalSpend",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "loyaltyPoints",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "lastVisitAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "lastActivityAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "lastServiceId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "pwaInstalled",
      "kind": "boolean",
      "nullable": false,
      "default": "false",
      "now": false
    },
    {
      "name": "source",
      "kind": "text",
      "nullable": false,
      "default": "\"walk_in\"",
      "now": false
    },
    {
      "name": "birthday",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "pushSubscriptions": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "customerId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "deviceLabel",
      "kind": "text",
      "nullable": false,
      "default": "\"Browser\"",
      "now": false
    },
    {
      "name": "endpoint",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "p256dh",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "auth",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "invalidAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "lastPushAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "queueOptIn",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "bookingOptIn",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "marketingOptIn",
      "kind": "boolean",
      "nullable": false,
      "default": "false",
      "now": false
    },
    {
      "name": "permission",
      "kind": "text",
      "nullable": false,
      "default": "\"granted\"",
      "now": false
    },
    {
      "name": "lastSeenAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "queueEntries": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "customerId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "serviceId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "staffId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "token",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "status",
      "kind": "text",
      "nullable": false,
      "default": "\"waiting\"",
      "now": false
    },
    {
      "name": "position",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "durationMin",
      "kind": "integer",
      "nullable": false,
      "default": "30",
      "now": false
    },
    {
      "name": "source",
      "kind": "text",
      "nullable": false,
      "default": "\"online\"",
      "now": false
    },
    {
      "name": "chair",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "notes",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "notifiedStage",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "joinedAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    },
    {
      "name": "startedAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "completedAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    }
  ],
  "bookings": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "customerId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "serviceId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "staffId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "token",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "scheduledAt",
      "kind": "timestamp",
      "nullable": false,
      "now": false
    },
    {
      "name": "durationMin",
      "kind": "integer",
      "nullable": false,
      "default": "30",
      "now": false
    },
    {
      "name": "status",
      "kind": "text",
      "nullable": false,
      "default": "\"confirmed\"",
      "now": false
    },
    {
      "name": "source",
      "kind": "text",
      "nullable": false,
      "default": "\"online\"",
      "now": false
    },
    {
      "name": "notes",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    },
    {
      "name": "extraServices",
      "kind": "json",
      "nullable": true,
      "now": false
    },
    {
      "name": "finalAmount",
      "kind": "integer",
      "nullable": true,
      "now": false
    }
  ],
  "visits": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "customerId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "serviceId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "staffId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "source",
      "kind": "text",
      "nullable": false,
      "default": "\"queue\"",
      "now": false
    },
    {
      "name": "amount",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "durationMin",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "waitMin",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "completedAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "offers": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "title",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "description",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "badge",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "expiresAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "active",
      "kind": "boolean",
      "nullable": false,
      "default": "true",
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "campaigns": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "title",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "body",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "imageUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "ctaLabel",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "ctaUrl",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "segment",
      "kind": "text",
      "nullable": false,
      "default": "\"all_opted_in\"",
      "now": false
    },
    {
      "name": "type",
      "kind": "text",
      "nullable": false,
      "default": "\"marketing\"",
      "now": false
    },
    {
      "name": "status",
      "kind": "text",
      "nullable": false,
      "default": "\"sent\"",
      "now": false
    },
    {
      "name": "audienceCount",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "openCount",
      "kind": "integer",
      "nullable": false,
      "default": "0",
      "now": false
    },
    {
      "name": "scheduledFor",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "sentAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "expiresAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    },
    {
      "name": "createdAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    }
  ],
  "notifications": [
    {
      "name": "id",
      "kind": "serial",
      "nullable": false,
      "now": false
    },
    {
      "name": "salonId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "customerId",
      "kind": "integer",
      "nullable": false,
      "now": false
    },
    {
      "name": "campaignId",
      "kind": "integer",
      "nullable": true,
      "now": false
    },
    {
      "name": "channel",
      "kind": "text",
      "nullable": false,
      "default": "\"push\"",
      "now": false
    },
    {
      "name": "type",
      "kind": "text",
      "nullable": false,
      "default": "\"queue\"",
      "now": false
    },
    {
      "name": "title",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "body",
      "kind": "text",
      "nullable": false,
      "now": false
    },
    {
      "name": "url",
      "kind": "text",
      "nullable": true,
      "now": false
    },
    {
      "name": "deliveredAt",
      "kind": "timestamp",
      "nullable": false,
      "now": true
    },
    {
      "name": "readAt",
      "kind": "timestamp",
      "nullable": true,
      "now": false
    }
  ]
} as const;
export const collectionNames: Record<EntityName, string> = {
  "salons": "salons",
  "workingHours": "workingHours",
  "services": "services",
  "staff": "staff",
  "staffServices": "staffServices",
  "customers": "customers",
  "pushSubscriptions": "pushSubscriptions",
  "queueEntries": "queue",
  "bookings": "bookings",
  "visits": "visits",
  "offers": "offers",
  "campaigns": "campaigns",
  "notifications": "notifications"
};
