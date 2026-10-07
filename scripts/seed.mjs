import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// Load DATABASE_URL from .env without extra deps.
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env optional */
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}
const token = (n = 10) => randomBytes(n).toString("base64url");
const minsAgo = (m) => new Date(Date.now() - m * 60000);
const daysAgo = (d, hour = 12, min = 0) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(hour, min, 0, 0);
  return x;
};
const pick = (arr, i) => arr[i % arr.length];

const SERVICES = [
  ["Haircut", "Hair", 250, 30, "Classic cut, wash and style."],
  ["Beard Trim", "Beard", 120, 15, "Shape up, line and hot towel."],
  ["Hair + Beard", "Combo", 350, 45, "The full grooming combo."],
  ["Hair Wash", "Hair", 100, 20, "Deep cleanse and blow dry."],
  ["Hair Colour", "Colour", 900, 90, "Global colour with after-care."],
  ["Clean-up Facial", "Skin", 600, 45, "Refreshing skin clean-up."],
];

const STAFF = [
  ["Rahul Mehta", "Senior stylist", "Fades, scissor work and classic cuts. 9 years on the chair.", "10:00", "21:00"],
  ["Imran Shaikh", "Barber", "Beard sculpting specialist.", "11:00", "21:00"],
  ["Nisha Rao", "Colour specialist", "Balayage, global colour and skin clean-ups.", "10:00", "19:00"],
];

const CUSTOMERS = [
  ["Amit Verma", "9820011001"], ["Kunal Joshi", "9820011002"], ["Sahil Khan", "9820011003"],
  ["Rohit Sharma", "9820011004"], ["Neha Gupta", "9820011005"], ["Vikram Singh", "9820011006"],
  ["Priya Nair", "9820011007"], ["Arjun Kapoor", "9820011008"], ["Dev Patel", "9820011009"],
  ["Meera Iyer", "9820011010"], ["Faisal Ahmed", "9820011011"], ["Tanvi Desai", "9820011012"],
  ["Karan Malhotra", "9820011013"], ["Sanjay Rao", "9820011014"], ["Ritu Bansal", "9820011015"],
  ["Harsh Vora", "9820011016"], ["Zoya Sheikh", "9820011017"], ["Nikhil Jain", "9820011018"],
];

async function main() {
  await client.connect();

  const existing = await client.query("select id from salons where slug = $1", ["abc-salon"]);
  if (existing.rows.length > 0) {
    console.log("[seed] abc-salon already exists — nothing to do.");
    await client.end();
    return;
  }

  const salon = (
    await client.query(
      `insert into salons
        (slug, name, tagline, about, brand_color, brand_ink, phone, whatsapp, email, address, maps_url,
         instagram, pwa_name, pwa_short_name, pwa_theme_color, queue_status, max_queue_size, plan)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open',20,'growth')
       returning id`,
      [
        "abc-salon",
        "ABC Salon",
        "Sharp cuts, no waiting around.",
        "A neighbourhood unisex salon in Bandra running three chairs, open seven days a week except Tuesday. We keep a live digital queue so you never stand around wondering.",
        "#BC5A2E",
        "#17120F",
        "+91 98200 11000",
        "+919820011000",
        "hello@abcsalon.com",
        "14 Hill Road, Bandra West, Mumbai 400050",
        "https://maps.google.com/?q=Hill+Road+Bandra+West+Mumbai",
        "abcsalon",
        "ABC Salon",
        "ABC Salon",
        "#BC5A2E",
      ],
    )
  ).rows[0];

  await client.query(
    `insert into owners (salon_id, name, email, password_hash, role) values ($1,$2,$3,$4,'owner')`,
    [salon.id, "Rahul Mehta", "owner@abcsalon.com", hashPassword("hairq1234")],
  );

  // Keep the demo believable *and* live: the shop is open around the current
  // server hour, and the weekly day off is never today.
  const nowHour = new Date().getHours();
  const openHour = Math.min(10, Math.max(0, nowHour - 1));
  const closeHour = Math.max(21, Math.min(23, nowHour + 6));
  const dayOff = (new Date().getDay() + 2) % 7;
  const pad = (n) => `${String(n).padStart(2, "0")}:00`;

  for (let day = 0; day < 7; day++) {
    await client.query(
      `insert into working_hours (salon_id, day_of_week, is_closed, open_time, close_time, break_start, break_end)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        salon.id,
        day,
        day === dayOff,
        pad(openHour),
        day === 0 ? pad(Math.min(23, closeHour)) : pad(closeHour),
        null,
        null,
      ],
    );
  }

  const serviceIds = [];
  for (let i = 0; i < SERVICES.length; i++) {
    const [name, category, price, duration, description] = SERVICES[i];
    const row = await client.query(
      `insert into services (salon_id, name, description, category, price, duration_min, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [salon.id, name, description, category, price, duration, i],
    );
    serviceIds.push({ id: row.rows[0].id, price, duration, name });
  }

  const staffIds = [];
  for (const [name, role, bio, start, end] of STAFF) {
    const row = await client.query(
      `insert into staff (salon_id, name, role, bio, shift_start, shift_end) values ($1,$2,$3,$4,$5,$6) returning id`,
      [salon.id, name, role, bio, start, end],
    );
    staffIds.push(row.rows[0].id);
  }
  for (const staffId of staffIds) {
    for (const svc of serviceIds) {
      const colourOnly = svc.name === "Hair Colour" || svc.name === "Clean-up Facial";
      const isColourist = staffId === staffIds[2];
      if (colourOnly && !isColourist) continue;
      await client.query(
        `insert into staff_services (salon_id, staff_id, service_id) values ($1,$2,$3)`,
        [salon.id, staffId, svc.id],
      );
    }
  }

  // ---------------------------------------------------------- customers
  const customerIds = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const [name, phone] = CUSTOMERS[i];
    const row = await client.query(
      `insert into customers (salon_id, name, phone, source, preferred_staff_id, created_at, last_activity_at, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [
        salon.id,
        name,
        phone,
        i % 3 === 0 ? "queue" : i % 3 === 1 ? "booking" : "walk_in",
        i % 4 === 0 ? pick(staffIds, i) : null,
        daysAgo(60 - i, 11),
        daysAgo(i % 40, 15),
        i === 1 ? "Scissors only, no machine on top." : i === 6 ? "Allergic to ammonia colour." : null,
      ],
    );
    customerIds.push(row.rows[0].id);
  }

  // --------------------------------------------------------- visit history
  let visitSeed = 7;
  const rand = () => {
    visitSeed = (visitSeed * 9301 + 49297) % 233280;
    return visitSeed / 233280;
  };

  for (let i = 0; i < customerIds.length; i++) {
    const visits = 1 + Math.floor(rand() * 6);
    let last = null;
    let spend = 0;
    for (let v = 0; v < visits; v++) {
      const svc = pick(serviceIds, Math.floor(rand() * serviceIds.length) + v);
      const staffId = pick(staffIds, Math.floor(rand() * staffIds.length));
      const dayOffset = Math.floor(rand() * 44) + v;
      const hour = 10 + Math.floor(rand() * 10);
      const when = daysAgo(dayOffset, hour, Math.floor(rand() * 59));
      if (when.getDay() === 2) continue;
      await client.query(
        `insert into visits (salon_id, customer_id, service_id, staff_id, source, amount, duration_min, wait_min, completed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          salon.id,
          customerIds[i],
          svc.id,
          staffId,
          rand() > 0.55 ? "booking" : "queue",
          svc.price,
          svc.duration,
          Math.floor(rand() * 45),
          when,
        ],
      );
      spend += svc.price;
      if (!last || when > last) last = when;
    }
    // A handful of services already completed earlier today, so the dashboard
    // and analytics show a real working day rather than zeros.
    if (i < 7) {
      const svc = pick(serviceIds, i);
      const openedAt = new Date();
      openedAt.setHours(openHour, 15, 0, 0);
      const span = Math.max(45 * 60000, Date.now() - openedAt.getTime());
      const when = new Date(Date.now() - ((i + 1) / 8) * span);
      {
        await client.query(
          `insert into visits (salon_id, customer_id, service_id, staff_id, source, amount, duration_min, wait_min, completed_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            salon.id,
            customerIds[i],
            svc.id,
            pick(staffIds, i),
            i % 3 === 0 ? "booking" : "queue",
            svc.price,
            svc.duration,
            8 + ((i * 7) % 34),
            when,
          ],
        );
        spend += svc.price;
        if (!last || when > last) last = when;
      }
    }

    const count = (
      await client.query("select count(*)::int as c, max(service_id) as s from visits where customer_id = $1", [
        customerIds[i],
      ])
    ).rows[0];
    await client.query(
      `update customers set total_visits = $2, total_spend = $3, loyalty_points = $4, last_visit_at = $5,
        last_service_id = $6 where id = $1`,
      [customerIds[i], count.c, spend, Math.round(spend / 50), last, count.s],
    );
  }

  // --------------------------------------------------- notification opt-ins
  for (let i = 0; i < 12; i++) {
    await client.query(
      `insert into push_subscriptions (salon_id, customer_id, device_label, queue_opt_in, booking_opt_in, marketing_opt_in, permission)
       values ($1,$2,$3,true,true,$4,'granted')`,
      [salon.id, customerIds[i], i % 2 === 0 ? "Android · Chrome" : "iPhone · Safari", i % 3 !== 2],
    );
    if (i % 3 === 0) {
      await client.query("update customers set pwa_installed = true where id = $1", [customerIds[i]]);
    }
  }

  // ------------------------------------------------------------- live queue
  const liveQueue = [
    { ci: 0, si: 0, staff: 0, status: "serving", started: minsAgo(12), pos: 1, chair: "Chair 1", source: "walk_in" },
    { ci: 1, si: 2, staff: 1, status: "serving", started: minsAgo(22), pos: 2, chair: "Chair 2", source: "online" },
    { ci: 2, si: 0, staff: null, status: "waiting", pos: 3, source: "online" },
    { ci: 3, si: 1, staff: 1, status: "waiting", pos: 4, source: "walk_in" },
    { ci: 4, si: 2, staff: null, status: "waiting", pos: 5, source: "online" },
    { ci: 5, si: 3, staff: 0, status: "waiting", pos: 6, source: "walk_in" },
  ];
  for (const q of liveQueue) {
    const svc = serviceIds[q.si];
    await client.query(
      `insert into queue_entries (salon_id, customer_id, service_id, staff_id, token, status, position, duration_min,
        source, chair, joined_at, started_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        salon.id,
        customerIds[q.ci],
        svc.id,
        q.staff === null ? null : staffIds[q.staff],
        token(),
        q.status,
        q.pos,
        svc.duration,
        q.source,
        q.chair ?? null,
        minsAgo(60 - q.pos * 7),
        q.started ?? null,
      ],
    );
  }

  // --------------------------------------------------------------- bookings
  const upcoming = [
    [6, 0, 0, 0, 17, 30], [7, 2, 1, 0, 18, 30], [8, 4, 2, 1, 11, 0],
    [9, 1, 1, 1, 16, 0], [10, 0, 0, 2, 12, 30], [11, 3, 2, 3, 19, 0],
  ];
  for (const [ci, si, staffIdx, dayAhead, hour, min] of upcoming) {
    const when = new Date();
    when.setDate(when.getDate() + dayAhead);
    when.setHours(hour, min, 0, 0);
    if (when < new Date()) when.setDate(when.getDate() + 1);
    await client.query(
      `insert into bookings (salon_id, customer_id, service_id, staff_id, token, scheduled_at, duration_min, status, source)
       values ($1,$2,$3,$4,$5,$6,$7,'confirmed',$8)`,
      [
        salon.id,
        customerIds[ci],
        serviceIds[si].id,
        staffIds[staffIdx],
        token(),
        when,
        serviceIds[si].duration,
        ci % 2 === 0 ? "online" : "manual",
      ],
    );
  }
  for (let i = 0; i < 4; i++) {
    await client.query(
      `insert into bookings (salon_id, customer_id, service_id, staff_id, token, scheduled_at, duration_min, status, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'online')`,
      [
        salon.id,
        customerIds[12 + i],
        serviceIds[i % serviceIds.length].id,
        staffIds[i % staffIds.length],
        token(),
        daysAgo(i + 2, 15, 0),
        serviceIds[i % serviceIds.length].duration,
        i === 3 ? "cancelled" : "completed",
      ],
    );
  }

  // ----------------------------------------------------------------- offers
  await client.query(
    `insert into offers (salon_id, title, description, badge) values
      ($1,'Hair + Beard at ₹399','Every Sunday until 2 PM. Walk-ins welcome.','Weekend'),
      ($1,'First visit — 15% off','Show this when you join the queue for the first time.','New here')`,
    [salon.id],
  );

  // -------------------------------------------------------------- campaign
  const campaign = (
    await client.query(
      `insert into campaigns (salon_id, title, body, segment, status, audience_count, sent_at, cta_label)
       values ($1,$2,$3,'all_opted_in','sent',$4,$5,'Book now') returning id`,
      [
        salon.id,
        "Weekend Special ✂️",
        "Haircut + Beard for ₹399 this Sunday. Book your slot before it fills up.",
        9,
        daysAgo(5, 11),
      ],
    )
  ).rows[0];
  for (let i = 0; i < 9; i++) {
    await client.query(
      `insert into notifications (salon_id, customer_id, campaign_id, type, title, body, url, delivered_at, read_at)
       values ($1,$2,$3,'marketing',$4,$5,$6,$7,$8)`,
      [
        salon.id,
        customerIds[i],
        campaign.id,
        "Weekend Special ✂️",
        "Haircut + Beard for ₹399 this Sunday. Book your slot before it fills up.",
        "/s/abc-salon/book",
        daysAgo(5, 11),
        i % 3 === 0 ? daysAgo(5, 13) : null,
      ],
    );
  }

  console.log("[seed] ABC Salon ready → /s/abc-salon · owner@abcsalon.com / hairq1234");
  await client.end();
}

main().catch(async (err) => {
  console.error("[seed] failed", err);
  try {
    await client.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
