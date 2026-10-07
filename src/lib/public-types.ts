export type PublicSalon = {
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
  queueStatus: "open" | "paused" | "closed";
  maxQueueSize: number;
  acceptingBookings: boolean;
  bookingHorizonDays: number;
  allowServiceChange: boolean;
  currency: string;
  pwaName: string;
};

export type PublicService = {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  durationMin: number;
};

export type PublicStaff = {
  id: number;
  name: string;
  role: string;
  photoUrl: string | null;
  bio: string | null;
  onShift: boolean;
};

export type PublicHours = {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
};

export type PublicOffer = {
  id: number;
  title: string;
  description: string | null;
  badge: string | null;
  expiresAt: string | null;
};

export type PublicState = {
  salon: PublicSalon;
  hours: PublicHours[];
  open: boolean;
  openLabel: string;
  services: PublicService[];
  staff: PublicStaff[];
  offers: PublicOffer[];
  queue: {
    status: "open" | "paused" | "closed";
    waiting: number;
    serving: number;
    full: boolean;
    chairCount: number;
    nextOpeningInMin: number;
    nextOpeningLabel: string;
    workloadMin: number;
    preview: { position: number; initial: string; serviceName: string; durationMin: number }[];
    inChair: { initial: string; serviceName: string; staffName: string | null }[];
  };
  now: string;
};

export type TicketState = {
  active: boolean;
  status?: string;
  serviceName?: string;
  entry?: {
    id: number;
    token: string;
    status: string;
    position: number;
    ahead: number;
    waitMin: number;
    waitLabel: string;
    waitExact: string;
    turnLabel: string;
    serviceName: string;
    serviceId: number;
    durationMin: number;
    staffName: string | null;
    customerName: string;
    customerId: number;
    joinedAt: string;
    stage: "waiting" | "soon" | "next" | "serving";
  };
  queue?: { waiting: number; serving: number; status: string; chairCount: number };
  salon: {
    name: string;
    slug: string;
    phone: string | null;
    whatsapp?: string | null;
    mapsUrl: string | null;
    address?: string | null;
    brandColor?: string;
    logoUrl?: string | null;
    allowServiceChange?: boolean;
  };
};
