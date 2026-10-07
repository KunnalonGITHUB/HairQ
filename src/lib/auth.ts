import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { owners, salons, sessions } from "@/db/schema";

const COOKIE = "hq_session";
const DAY = 1000 * 60 * 60 * 24;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(key, "hex");
  if (derived.length !== original.length) return false;
  return timingSafeEqual(derived, original);
}

export function newToken(size = 24): string {
  return randomBytes(size).toString("base64url");
}

export async function createSession(ownerId: number): Promise<void> {
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + 30 * DAY);
  await db.insert(sessions).values({ token, ownerId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(COOKIE);
}

export type SessionUser = {
  ownerId: number;
  name: string;
  email: string;
  role: string;
  salonId: number;
  salonName: string;
  salonSlug: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      ownerId: owners.id,
      name: owners.name,
      email: owners.email,
      role: owners.role,
      salonId: salons.id,
      salonName: salons.name,
      salonSlug: salons.slug,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(owners, eq(owners.id, sessions.ownerId))
    .innerJoin(salons, eq(salons.id, owners.salonId))
    .where(eq(sessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return null;
  }
  const { expiresAt: _expiresAt, ...user } = row;
  return user;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
