# HairQ API authorization audit

All active business data uses Firestore. Protected owner requests verify a Firebase session cookie, load users/{uid}, and allow owner/manager/front_desk. Owner body/query salonId is validated against the authorized profile; repositories use the server-derived salon. Next.js Node runtime is the default; no Edge routes are configured. Direct browser Firestore access remains denied.

| Route | Methods | Access / authentication | Tenant / authorization | Repositories or data helper |
| --- | --- | --- | --- | --- |
| /api/auth | GET, POST | Public CSRF/login/signup; verified Firebase ID token; cookie on logout | UID/profile; signup creates own salon, server-owned role | createSalonWorkspace |
| /api/health | GET | Public | Health/public key or opaque endpoint registry | getFirebaseFirestore |
| /api/owner/bookings | GET, POST | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | bookingRepository, staffRepository, serviceRepository |
| /api/owner/bookings/[id] | PATCH | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | bookingRepository, queueRepository |
| /api/owner/campaigns | GET, POST, PATCH | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | customerRepository, visitRepository, campaignRepository, notificationRepository |
| /api/owner/customers | GET, POST | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | customerRepository, staffRepository, serviceRepository |
| /api/owner/customers/[id] | GET, PATCH, DELETE | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | customerRepository, visitRepository, bookingRepository, queueRepository, pushSubscriptionRepository, staffRepository, serviceRepository, notificationRepository |
| /api/owner/qr | GET | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | getSalonById |
| /api/owner/queue | GET, POST, PATCH | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | serviceRepository, staffRepository, visitRepository, queueRepository, salonRepository |
| /api/owner/queue/[id] | PATCH | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | queueRepository, serviceRepository |
| /api/owner/salon | GET, PATCH | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | salonRepository, workingHoursRepository, offerRepository |
| /api/owner/services | GET, POST | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | serviceRepository, staffRepository, staffServiceRepository |
| /api/owner/services/[id] | PATCH, DELETE | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | serviceRepository, staffServiceRepository, queueRepository, bookingRepository |
| /api/owner/staff | GET, POST | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | staffRepository, serviceRepository, staffServiceRepository, queueRepository |
| /api/owner/staff/[id] | PATCH, DELETE | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | staffRepository, staffServiceRepository, queueRepository |
| /api/owner/summary | GET | Protected: Firebase cookie + fresh UID profile | Profile salonId; owner/manager/front_desk | visitRepository, bookingRepository, customerRepository, serviceRepository, staffRepository |
| /api/public/push-key | GET | Public | Health/public key or opaque endpoint registry | pushPublicKey |
| /api/public/push-resubscribe | POST | Public | Health/public key or opaque endpoint registry | rotatePushEndpoint |
| /api/public/[slug]/book | GET, POST | Public | Slug resolves salon; customer privacy caveat below | serviceRepository, bookingRepository |
| /api/public/[slug]/book/[token] | GET, DELETE | Public | Slug + opaque queue/booking token | bookingRepository, staffRepository |
| /api/public/[slug]/lookup | POST | Public | Slug resolves salon; customer privacy caveat below | customerRepository, visitRepository, bookingRepository, queueRepository, serviceRepository, staffRepository, pushSubscriptionRepository |
| /api/public/[slug]/notify | GET, POST | Public | Slug resolves salon; customer privacy caveat below | notificationRepository, pushSubscriptionRepository, customerRepository |
| /api/public/[slug]/queue | POST | Public | Slug resolves salon; customer privacy caveat below | serviceRepository, queueRepository |
| /api/public/[slug]/queue/[token] | GET, PATCH, DELETE | Public | Slug + opaque queue/booking token | queueRepository, serviceRepository |
| /api/public/[slug] | GET | Public | Slug resolves salon; customer privacy caveat below | serviceRepository, staffRepository |

Public customer lookup and notify routes preserve the existing unauthenticated model. A phone number or numeric customerId alone is not proof of ownership. This remains a pre-existing production privacy blocker and must not be confused with successful owner tenant-isolation tests.

Campaign PATCH supports cancel/delete, not arbitrary content editing. Scheduled campaigns persist but no scheduler exists. There is no password-reset UI/route.
