import { eq } from "drizzle-orm";
import { db } from "@/db";
import { owners, salons } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { fail, guarded, ok, str } from "@/lib/api-helpers";
import { createSalonWorkspace } from "@/lib/onboarding";

export async function POST(request: Request) {
  return guarded(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    if (action === "logout") {
      await destroySession();
      return ok({ ok: true });
    }

    const email = str(body.email).toLowerCase();
    const password = str(body.password);

    if (action === "login") {
      if (!email || !password) return fail("Enter your email and password.");
      const rows = await db
        .select({
          id: owners.id,
          passwordHash: owners.passwordHash,
          slug: salons.slug,
        })
        .from(owners)
        .innerJoin(salons, eq(salons.id, owners.salonId))
        .where(eq(owners.email, email))
        .limit(1);
      const row = rows[0];
      if (!row || !verifyPassword(password, row.passwordHash)) {
        return fail("That email and password don't match an account.", 401);
      }
      await createSession(row.id);
      return ok({ ok: true, slug: row.slug });
    }

    if (action === "signup") {
      const salonName = str(body.salonName);
      const ownerName = str(body.ownerName);
      if (!salonName) return fail("Tell us your salon's name.");
      if (!ownerName) return fail("Tell us your name.");
      if (!email.includes("@")) return fail("Enter a valid email address.");
      if (password.length < 8) return fail("Use a password with at least 8 characters.");

      const existing = await db
        .select({ id: owners.id })
        .from(owners)
        .where(eq(owners.email, email))
        .limit(1);
      if (existing.length > 0) {
        return fail("An account already uses that email. Try signing in instead.", 409);
      }

      const { salon, owner } = await createSalonWorkspace({
        salonName,
        ownerName,
        email,
        password,
        phone: str(body.phone) || undefined,
        city: str(body.city) || undefined,
      });
      await createSession(owner.id);
      return ok({ ok: true, slug: salon.slug }, 201);
    }

    return fail("Unknown action.");
  });
}
