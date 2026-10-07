import { eq } from "drizzle-orm";
import { db } from "@/db";
import { offers, owners, salons, services, staff, staffServices, workingHours } from "@/db/schema";
import { hashPassword } from "./auth";
import { slugify } from "./api-helpers";

const STARTER_SERVICES = [
  { name: "Haircut", category: "Hair", price: 250, durationMin: 30, description: "Classic cut, wash and style." },
  { name: "Beard Trim", category: "Beard", price: 120, durationMin: 15, description: "Shape up, line and finish." },
  { name: "Hair + Beard", category: "Combo", price: 350, durationMin: 45, description: "Full grooming combo." },
  { name: "Hair Wash", category: "Hair", price: 100, durationMin: 20, description: "Deep cleanse and blow dry." },
  { name: "Hair Colour", category: "Colour", price: 900, durationMin: 90, description: "Global colour with care." },
  { name: "Clean-up Facial", category: "Skin", price: 600, durationMin: 45, description: "Refreshing skin clean-up." },
];

export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "salon";
  let candidate = root;
  let n = 1;
  // Small loop — slugs collide rarely.
  while (true) {
    const existing = await db.select({ id: salons.id }).from(salons).where(eq(salons.slug, candidate)).limit(1);
    if (existing.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createSalonWorkspace(input: {
  salonName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
}) {
  const slug = await uniqueSlug(input.salonName);

  const [salon] = await db
    .insert(salons)
    .values({
      slug,
      name: input.salonName,
      tagline: "Walk in without the wait.",
      about: `${input.salonName} runs a live digital queue so you always know when it's your turn.`,
      phone: input.phone ?? null,
      whatsapp: input.phone ?? null,
      email: input.email,
      address: input.city ?? null,
      pwaName: input.salonName,
      pwaShortName: input.salonName.split(" ")[0]?.slice(0, 12) ?? input.salonName.slice(0, 12),
      pwaThemeColor: "#BC5A2E",
    })
    .returning();

  const [owner] = await db
    .insert(owners)
    .values({
      salonId: salon.id,
      name: input.ownerName,
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
    })
    .returning();

  await db.insert(workingHours).values(
    Array.from({ length: 7 }, (_, day) => ({
      salonId: salon.id,
      dayOfWeek: day,
      isClosed: day === 2, // Tuesday off is the Indian salon norm
      openTime: "10:00",
      closeTime: "21:00",
    })),
  );

  const createdServices = await db
    .insert(services)
    .values(
      STARTER_SERVICES.map((s, i) => ({
        salonId: salon.id,
        name: s.name,
        description: s.description,
        category: s.category,
        price: s.price,
        durationMin: s.durationMin,
        sortOrder: i,
      })),
    )
    .returning();

  const createdStaff = await db
    .insert(staff)
    .values([
      { salonId: salon.id, name: input.ownerName, role: "Owner · Senior stylist" },
      { salonId: salon.id, name: "Chair 2", role: "Barber" },
    ])
    .returning();

  await db.insert(staffServices).values(
    createdStaff.flatMap((member) =>
      createdServices.map((svc) => ({
        salonId: salon.id,
        staffId: member.id,
        serviceId: svc.id,
      })),
    ),
  );

  await db.insert(offers).values({
    salonId: salon.id,
    title: "First visit — 15% off",
    description: "Show this on your first booking through our app.",
    badge: "New here",
  });

  return { salon, owner };
}
