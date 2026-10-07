import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { salons } from "@/db/schema";
import { IconCheck, IconScissors } from "@/components/icons";

export const dynamic = "force-dynamic";

const PHOTO = "https://images.pexels.com/photos/13138476/pexels-photo-13138476.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200";

const FEATURES = [
  {
    title: "A queue that does the maths",
    body: "Estimates come from real service durations and the chairs actually working — not people × 30 minutes. Finish early and every estimate moves earlier.",
  },
  {
    title: "One line, not two",
    body: "Walk-ins you add at the counter and customers who scan the QR sit in the same queue. No parallel lists, no arguments about who came first.",
  },
  {
    title: "Bookings that respect reality",
    body: "Slots are generated from working hours, barber shifts, breaks and service length. Double bookings are impossible.",
  },
  {
    title: "A customer list that fills itself",
    body: "Every queue join, booking and completed service updates the same record. No duplicates, no data entry.",
  },
  {
    title: "Push offers, with consent",
    body: "Queue alerts and promotions are separate permissions. Send a Tuesday offer only to people who agreed to hear from you.",
  },
  {
    title: "Your salon, installed",
    body: "Customers add your salon to their home screen — your name, your icon, your colour. HairQ never appears.",
  },
];

export default async function LandingPage() {
  const rows = await db.select({ slug: salons.slug, name: salons.name }).from(salons).orderBy(desc(salons.id)).limit(1);
  const demo = rows[0];

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white">
              <IconScissors width={16} height={16} />
            </span>
            <span className="text-[16px] font-semibold tracking-[-0.025em]">HairQ</span>
          </Link>
          <nav className="ml-6 hidden gap-6 text-[13.5px] text-ink-2 md:flex">
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
            <a href="#white-label" className="transition-colors hover:text-ink">White label</a>
            <a href="#features" className="transition-colors hover:text-ink">Features</a>
            <a href="#demo" className="transition-colors hover:text-ink">Live demo</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Start free</Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-14 lg:pt-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-clay">
              Virtual queue · Bookings · Salon CRM
            </p>
            <h1 className="mt-4 text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[52px]">
              Your salon already runs on a line.
              <span className="block text-muted">HairQ makes it invisible.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-ink-2">
              Customers scan your QR, see the real wait, and join the queue from the pavement, the café or
              their sofa. You run the floor from one screen — and keep every customer in your own database.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link href="/signup" className="btn btn-primary btn-lg">Set up your salon</Link>
              {demo ? (
                <Link href={`/s/${demo.slug}`} className="btn btn-quiet btn-lg">
                  See a customer page
                </Link>
              ) : null}
            </div>
            <p className="mt-4 text-[12.5px] text-muted">
              No website needed. No app store. Works on the phone already in their hand.
            </p>
          </div>

          {/* composed live-queue mock */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl bg-ink text-white shadow-[0_28px_60px_-32px_rgba(25,20,17,.6)]">
              <div className="px-6 pb-6 pt-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#7FC6A6]" />
                    Live queue
                  </span>
                  <span className="text-[11.5px] text-white/40">2 chairs working</span>
                </div>
                <div className="mt-5 flex items-end gap-5">
                  <div>
                    <p className="num text-[46px] font-semibold leading-none tracking-[-0.045em]">3</p>
                    <p className="mt-1.5 text-[12.5px] text-white/50">people waiting</p>
                  </div>
                  <div className="mb-1 h-10 w-px bg-white/10" />
                  <div className="mb-0.5">
                    <p className="text-[19px] font-semibold tracking-[-0.02em]">~ 35 min</p>
                    <p className="mt-1.5 text-[12.5px] text-white/50">Next free chair around 2:20 PM</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {[
                    ["1", "Haircut · 30m"],
                    ["2", "Beard trim · 15m"],
                    ["3", "Hair + Beard · 45m"],
                  ].map(([n, label]) => (
                    <span
                      key={n}
                      className="num flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/60"
                    >
                      <span className="text-white/30">{n}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/10">
                <span className="bg-clay py-3.5 text-center text-[14.5px] font-semibold">Join live queue</span>
                <span className="bg-white/[0.04] py-3.5 text-center text-[14.5px] text-white/75">Book for later</span>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <div className="h-[116px] flex-1 overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PHOTO} alt="Barbershop interior" className="h-full w-full object-cover" />
              </div>
              <div className="flex w-[142px] shrink-0 flex-col justify-center rounded-xl border border-line bg-surface px-3.5">
                <p className="num text-[22px] font-semibold leading-none tracking-[-0.03em]">38%</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">less time spent waiting in the shop</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- white label */}
      <section id="white-label" className="border-y border-line bg-paper-2">
        <div className="mx-auto max-w-[1120px] px-5 py-16">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">The important bit</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.03em]">
              The owner sees HairQ. The customer sees your salon.
            </h2>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface p-6">
              <span className="chip chip-info">For you</span>
              <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.02em]">HairQ Owner Console</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                Live queue, bookings, customers, audience, notifications, services, staff, analytics and
                settings — one place to run the shop, on desktop or on the phone in your apron.
              </p>
              <ul className="mt-4 space-y-2">
                {["Start, complete, reorder and reassign in a tap", "Add walk-ins into the same queue", "See who's going cold and win them back"].map((t) => (
                  <li key={t} className="flex gap-2 text-[13.5px] text-ink-2">
                    <IconCheck width={15} height={15} className="mt-0.5 shrink-0 text-pine" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6">
              <span className="chip chip-serving">For them</span>
              <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.02em]">Your salon&apos;s own app</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                Your name, your logo, your colour, your services. Installed to the home screen as
                <span className="font-medium text-ink"> ABC Salon</span> — not as HairQ. Customers never meet us.
              </p>
              <ul className="mt-4 space-y-2">
                {["Dynamic web manifest per salon", "Queue, booking and offer notifications", "Nothing to download from a store"].map((t) => (
                  <li key={t} className="flex gap-2 text-[13.5px] text-ink-2">
                    <IconCheck width={15} height={15} className="mt-0.5 shrink-0 text-pine" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- how it works */}
      <section id="how" className="mx-auto max-w-[1120px] px-5 py-16">
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">Live in an afternoon</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {[
            ["01", "Set up your menu", "Services with real durations, your barbers and their shifts, your opening hours. We start you off with sensible defaults."],
            ["02", "Print the QR", "Counter, mirror, door, visiting card, Instagram bio. One scan opens your salon page — no app, no login."],
            ["03", "Run the floor", "Start and complete services as you go. Every estimate on every customer's phone updates itself."],
          ].map(([num, title, body]) => (
            <div key={num} className="border-t border-ink pt-4">
              <p className="num text-[12px] font-semibold tracking-[0.1em] text-clay">{num}</p>
              <h3 className="mt-2.5 text-[17px] font-semibold tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- features */}
      <section id="features" className="border-t border-line bg-paper-2">
        <div className="mx-auto max-w-[1120px] px-5 py-16">
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.03em]">
            Built around how a salon actually works
          </h2>
          <div className="mt-9 grid gap-x-10 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="text-[15.5px] font-semibold tracking-[-0.015em]">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- no website */}
      <section className="mx-auto max-w-[1120px] px-5 py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">
              No website? You don&apos;t need one.
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
              Sign up and you immediately get <span className="num font-medium">hairq.app/your-salon</span> plus
              a QR code. That link is your booking system, your queue and your shop window.
            </p>
          </div>
          <div>
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">
              Already have one? Even better.
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
              Drop a <span className="font-medium text-ink">Join Live Queue</span> or{" "}
              <span className="font-medium text-ink">Book Online</span> button on your site. It opens your
              white-labelled HairQ experience — and premium salons can run it on their own domain.
            </p>
            {demo ? (
              <Link href={`/site/${demo.slug}`} className="btn btn-quiet btn-sm mt-4">
                See the website add-on
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- demo */}
      <section id="demo" className="mx-auto max-w-[1120px] px-5 pb-20">
        <div className="rounded-2xl bg-ink px-6 py-10 text-white sm:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-lg">
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">
                Walk through a real salon
              </h2>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/60">
                {demo ? `${demo.name} is a fully seeded workspace — live queue, bookings, customers and campaigns. Join the queue as a customer, then open the console and serve yourself.` : "Create your workspace and HairQ will set up your services, staff and customer link automatically."}
              </p>
              {demo ? (
                <p className="num mt-4 inline-block rounded-lg bg-white/[0.06] px-3 py-2 text-[12.5px] text-white/70">
                  owner@abcsalon.com · hairq1234
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {demo ? (
                <Link href={`/s/${demo.slug}`} className="btn btn-brand btn-lg" style={{ background: "#BC5A2E" }}>
                  Open customer app
                </Link>
              ) : null}
              <Link
                href="/login"
                className="btn btn-lg border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
              >
                Open owner console
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-4 px-5 py-7 text-[12.5px] text-muted">
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-white">
              <IconScissors width={12} height={12} />
            </span>
            <span className="font-semibold text-ink">HairQ</span>
          </span>
          <span>The operating system for salons.</span>
          <span className="ml-auto flex gap-5">
            <Link href="/login" className="hover:text-ink">Sign in</Link>
            <Link href="/signup" className="hover:text-ink">Start free</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
