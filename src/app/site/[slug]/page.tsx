import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services as servicesTable, staff as staffTable } from "@/db/schema";
import { IconClock, IconMapPin, IconPhone, IconScissors } from "@/components/icons";
import {
  brandVars,
  getActiveOffers,
  getHours,
  getSalonBySlug,
  loadLiveQueue,
  openStatus,
} from "@/lib/salon-data";
import { DAY_NAMES, clockLabel, humanDuration, minutesToLabel, toMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

const GALLERY = [
  "https://images.pexels.com/photos/13138476/pexels-photo-13138476.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/18090355/pexels-photo-18090355.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/12339159/pexels-photo-12339159.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
];

const REVIEWS = [
  { name: "Arjun K.", text: "Scanned the code outside, joined the queue and went for a coffee. Got a buzz when I was next. Perfect.", stars: 5 },
  { name: "Meera S.", text: "Booked Sunday evening in about thirty seconds. They remembered my usual colour too.", stars: 5 },
  { name: "Dev P.", text: "Walk-in on a Saturday and it still told me exactly how long. No more guessing games.", stars: 4 },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  return {
    title: salon ? `${salon.name} — ${salon.tagline ?? "Salon & barbershop"}` : "Salon",
  };
}

export default async function SalonWebsite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  if (!salon) notFound();

  const [hours, live, services, team, offers] = await Promise.all([
    getHours(salon.id),
    loadLiveQueue(salon.id),
    db
      .select()
      .from(servicesTable)
      .where(and(eq(servicesTable.salonId, salon.id), eq(servicesTable.active, true)))
      .orderBy(servicesTable.sortOrder),
    db
      .select()
      .from(staffTable)
      .where(and(eq(staffTable.salonId, salon.id), eq(staffTable.active, true))),
    getActiveOffers(salon.id),
  ]);

  const status = openStatus(hours);
  const waiting = live.waiting.length;

  return (
    <div style={brandVars(salon)} className="min-h-dvh bg-paper">
      {/* live strip */}
      <div className="bg-ink text-white">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12.5px]">
          <span className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${status.open ? "bg-[#7FC6A6] live-dot" : "bg-white/30"}`} />
            {status.open ? "Open now" : status.label}
          </span>
          {status.open ? (
            <span className="text-white/60">
              {waiting === 0 ? "No queue — walk right in" : `${waiting} waiting · next chair around ${clockLabel(live.projection.nextOpeningAt)}`}
            </span>
          ) : null}
          <Link href={`/s/${salon.slug}`} className="ml-auto underline underline-offset-2 hover:text-white">
            Open the queue app →
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] items-center gap-4 px-5 py-3.5">
          <span className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 place-items-center rounded-xl text-[13px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              {salon.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="text-[16px] font-semibold tracking-[-0.025em]">{salon.name}</span>
          </span>
          <nav className="ml-4 hidden gap-5 text-[13.5px] text-ink-2 lg:flex">
            <a href="#about" className="hover:text-ink">About</a>
            <a href="#services" className="hover:text-ink">Services</a>
            <a href="#team" className="hover:text-ink">Team</a>
            <a href="#gallery" className="hover:text-ink">Gallery</a>
            <a href="#visit" className="hover:text-ink">Visit</a>
          </nav>
          <div className="ml-auto flex gap-2">
            <Link href={`/s/${salon.slug}/book`} className="btn btn-quiet btn-sm">Book online</Link>
            <Link href={`/s/${salon.slug}/join`} className="btn btn-sm btn-brand">Join live queue</Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-[1080px] items-center gap-10 px-5 py-14 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--brand)" }}>
            {salon.address ?? "Your neighbourhood salon"}
          </p>
          <h1 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[50px]">
            {salon.tagline ?? "Sharp cuts, no waiting around."}
          </h1>
          <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-ink-2">
            {salon.about ??
              `${salon.name} keeps a live digital queue, so you always know exactly when it's your turn.`}
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href={`/s/${salon.slug}/book`} className="btn btn-lg btn-primary">
              Book your haircut online
            </Link>
            <Link href={`/s/${salon.slug}/join`} className="btn btn-lg btn-quiet">
              Join live queue
            </Link>
          </div>
          {offers.length > 0 ? (
            <p className="mt-5 inline-block rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
              <span className="font-semibold">{offers[0].title}</span>
              {offers[0].description ? ` · ${offers[0].description}` : ""}
            </p>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={GALLERY[0]} alt={salon.name} className="h-[340px] w-full object-cover" />
        </div>
      </section>

      {/* about */}
      <section id="about" className="border-y border-line bg-paper-2">
        <div className="mx-auto grid max-w-[1080px] gap-8 px-5 py-14 md:grid-cols-3">
          {[
            ["No standing around", "Join the queue from your phone and track your position live. We'll tell you when to head over."],
            ["Book ahead", "Pick your barber, your service and a time that suits. Your chair is held for you."],
            ["We remember you", "Your usual cut, your favourite barber and your visit history — ready before you sit down."],
          ].map(([t, b]) => (
            <div key={t} className="border-t border-ink pt-4">
              <h3 className="text-[16px] font-semibold tracking-[-0.02em]">{t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* services */}
      <section id="services" className="mx-auto max-w-[1080px] px-5 py-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[28px] font-semibold tracking-[-0.03em]">Services & prices</h2>
          <Link href={`/s/${salon.slug}/book`} className="btn btn-quiet btn-sm">Book a slot</Link>
        </div>
        <div className="mt-7 grid gap-x-10 gap-y-1 md:grid-cols-2">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/s/${salon.slug}/book?service=${s.id}`}
              className="group flex items-baseline gap-3 border-b border-line py-3.5"
            >
              <span className="text-[15px] font-medium transition-colors group-hover:text-clay">{s.name}</span>
              <span className="num text-[12.5px] text-faint">{s.durationMin} min</span>
              <span className="mx-1 flex-1 border-b border-dotted border-line-2" />
              <span className="num text-[15px] font-semibold">₹{s.price}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* team */}
      <section id="team" className="border-t border-line bg-paper-2">
        <div className="mx-auto max-w-[1080px] px-5 py-14">
          <h2 className="text-[28px] font-semibold tracking-[-0.03em]">The chairs</h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((m) => (
              <div key={m.id} className="rounded-xl border border-line bg-surface p-4">
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl text-[15px] font-semibold text-white"
                  style={{ background: "var(--brand)" }}
                >
                  {m.name.slice(0, 1)}
                </span>
                <p className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{m.name}</p>
                <p className="text-[13px] text-muted">{m.role}</p>
                {m.bio ? <p className="mt-2 text-[12.5px] leading-snug text-muted">{m.bio}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* gallery */}
      <section id="gallery" className="mx-auto max-w-[1080px] px-5 py-14">
        <h2 className="text-[28px] font-semibold tracking-[-0.03em]">Inside the shop</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {GALLERY.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`${salon.name} ${i + 1}`}
              className="h-[200px] w-full rounded-xl border border-line object-cover"
            />
          ))}
        </div>
      </section>

      {/* reviews */}
      <section className="border-y border-line bg-paper-2">
        <div className="mx-auto max-w-[1080px] px-5 py-14">
          <h2 className="text-[28px] font-semibold tracking-[-0.03em]">What people say</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {REVIEWS.map((r) => (
              <figure key={r.name} className="rounded-xl border border-line bg-surface p-5">
                <div className="text-[13px]" style={{ color: "var(--brand)" }}>
                  {"★".repeat(r.stars)}
                  <span className="text-line-2">{"★".repeat(5 - r.stars)}</span>
                </div>
                <blockquote className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{r.text}</blockquote>
                <figcaption className="mt-3 text-[12.5px] text-muted">{r.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* visit */}
      <section id="visit" className="mx-auto grid max-w-[1080px] gap-10 px-5 py-14 md:grid-cols-2">
        <div>
          <h2 className="text-[28px] font-semibold tracking-[-0.03em]">Find us</h2>
          <div className="mt-5 space-y-3 text-[14px] text-ink-2">
            {salon.address ? (
              <p className="flex items-start gap-2.5">
                <IconMapPin width={17} height={17} className="mt-0.5 shrink-0 text-faint" />
                {salon.address}
              </p>
            ) : null}
            {salon.phone ? (
              <p className="flex items-center gap-2.5">
                <IconPhone width={17} height={17} className="shrink-0 text-faint" />
                {salon.phone}
              </p>
            ) : null}
            <p className="flex items-center gap-2.5">
              <IconClock width={17} height={17} className="shrink-0 text-faint" />
              {status.label}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {salon.mapsUrl ? (
              <a href={salon.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">
                Get directions
              </a>
            ) : null}
            {salon.whatsapp ? (
              <a
                href={`https://wa.me/${salon.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-quiet btn-sm"
              >
                WhatsApp us
              </a>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface px-5 py-2">
          {hours.map((h) => (
            <div
              key={h.dayOfWeek}
              className="flex items-center justify-between border-b border-line py-2.5 text-[13.5px] last:border-0"
            >
              <span className={h.dayOfWeek === new Date().getDay() ? "font-semibold" : "text-muted"}>
                {DAY_NAMES[h.dayOfWeek]}
              </span>
              <span className="num text-ink-2">
                {h.isClosed
                  ? "Closed"
                  : `${minutesToLabel(toMinutes(h.openTime) ?? 0)} – ${minutesToLabel(toMinutes(h.closeTime) ?? 0)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-[1080px] px-5 pb-16">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-ink px-7 py-9 text-white">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.03em]">Skip the wait today</h2>
            <p className="mt-1.5 text-[14px] text-white/60">
              {status.open
                ? waiting === 0
                  ? "Nobody is waiting right now."
                  : `${waiting} in the queue · about ${humanDuration(live.projection.nextOpeningInMin)} to the next free chair.`
                : "We're closed right now — book your slot for the next opening."}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Link href={`/s/${salon.slug}/join`} className="btn btn-lg btn-brand">
              Join live queue
            </Link>
            <Link
              href={`/s/${salon.slug}/book`}
              className="btn btn-lg border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
            >
              Book online
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-3 px-5 py-7 text-[12.5px] text-muted">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <IconScissors width={14} height={14} />
            {salon.name}
          </span>
          <span>© {new Date().getFullYear()}</span>
          <Link href={`/s/${salon.slug}`} className="ml-auto hover:text-ink">
            Queue & bookings
          </Link>
        </div>
      </footer>
    </div>
  );
}
