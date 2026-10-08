import { salonRepository, workingHoursRepository, serviceRepository, staffRepository, staffServiceRepository, offerRepository } from "./firestore/repositories";
import { salons as salonFields } from "./firestore/fields";
import { eq as firestoreEq } from "./firestore/query";
import { provisionOwnerWorkspace } from "./firestore/store";
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
    const existing = await salonRepository.find(null, { where: firestoreEq(salonFields.slug, candidate), limit: 1 });
    if (existing.length === 0) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createSalonWorkspace(input: {
  salonName: string;
  ownerName: string;
  email: string;
  uid: string;
  phone?: string;
  city?: string;
}) {
  const slug = await uniqueSlug(input.salonName);

  return provisionOwnerWorkspace({uid:input.uid,email:input.email,name:input.ownerName}, {
      slug, name:input.salonName, tagline:"Walk in without the wait.",
      about:input.salonName+" runs a live digital queue so you always know when it's your turn.",
      phone:input.phone??null,whatsapp:input.phone??null,email:input.email,address:input.city??null,
      pwaName:input.salonName,pwaShortName:input.salonName.split(" ")[0].slice(0,12),pwaThemeColor:"#BC5A2E",
  }, async (salon) => {
  await workingHoursRepository.create(salon.id,
    Array.from({ length: 7 }, (_, day) => ({
      salonId: salon.id,
      dayOfWeek: day,
      isClosed: day === 2, // Tuesday off is the Indian salon norm
      openTime: "10:00",
      closeTime: "21:00",
    })),
  );

  const createdServices = await serviceRepository.create(salon.id,
      STARTER_SERVICES.map((s, i) => ({
        salonId: salon.id,
        name: s.name,
        description: s.description,
        category: s.category,
        price: s.price,
        durationMin: s.durationMin,
        sortOrder: i,
      })),
    );

  const createdStaff = await staffRepository.create(salon.id,[
      { salonId: salon.id, name: input.ownerName, role: "Owner · Senior stylist" },
      { salonId: salon.id, name: "Chair 2", role: "Barber" },
    ]);

  await staffServiceRepository.create(salon.id,
    createdStaff.flatMap((member) =>
      createdServices.map((svc) => ({
        salonId: salon.id,
        staffId: member.id,
        serviceId: svc.id,
      })),
    ),
  );

  await offerRepository.create(salon.id, {
    salonId: salon.id,
    title: "First visit — 15% off",
    description: "Show this on your first booking through our app.",
    badge: "New here",
  });

  });

}
