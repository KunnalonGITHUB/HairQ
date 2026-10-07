import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function withOwner(
  fn: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return fail("Your session has expired. Please sign in again.", 401);
  try {
    return await fn(user);
  } catch (err) {
    console.error("[hairq] owner route error", err);
    return fail("Something went wrong on our side. Please try again.", 500);
  }
}

export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error("[hairq] route error", err);
    return fail("Something went wrong on our side. Please try again.", 500);
  }
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export function validPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
