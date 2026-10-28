import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";
import { RepositoryError, runTransaction } from "./firestore/store";
import { FirebaseAccessError } from "./firebase/auth";
import { FirebaseConfigurationError } from "./firebase/admin-env";
import { assertAuthMutation } from "./auth-csrf";

// Firestore can retry transaction callbacks. Read each request body once.
const requestBodies = new WeakMap<Request, Promise<unknown>>();
export function requestJson(request: Request): Promise<unknown> {
  if (!requestBodies.has(request)) requestBodies.set(request, request.json());
  return requestBodies.get(request)!;
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

function firestoreFailure(error: unknown): Response | null {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === 10 || code === "aborted") return fail("This changed while you were editing. Please try again.", 409);
  if (code === 8 || code === "resource-exhausted") return fail("The service is busy. Please try again shortly.", 429);
  if ([4, 14, "deadline-exceeded", "unavailable"].includes(code as number | string)) return fail("The service is temporarily unavailable. Please try again.", 503);
  return null;
}

/**
 * Logs only the error name, except for configuration errors, whose messages
 * name the missing or invalid variables and never contain secret values.
 */
function logRouteError(label: string, err: unknown) {
  if (err instanceof FirebaseConfigurationError) {
    console.error(`[hairq] ${label}: ${err.message}`);
    return;
  }
  console.error(`[hairq] ${label}`, err instanceof Error ? err.name : "UnknownError");
}

export async function withOwner(
  fn: (user: SessionUser) => Promise<Response>,
  request?: Request,
): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Your session has expired. Please sign in again.", 401);
    if (!["owner", "manager", "front_desk"].includes(user.role)) return fail("Salon access denied.", 403);
    if (request) {
      await assertAuthMutation(request);
      const requested = new URL(request.url).searchParams.get("salonId");
      const body = ["GET", "HEAD", "OPTIONS"].includes(request.method) ? null : await requestJson(request).catch(() => null);
      const bodySalon = body && typeof body === "object" && "salonId" in body ? body.salonId : null;
      if ([requested, bodySalon].some(id => id != null && String(id) !== String(user.salonId))) return fail("Salon access denied.", 403);
    }
    const response = await runTransaction(() => fn(user), user.salonId);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  } catch (err) {
    if (err instanceof FirebaseAccessError) return fail(err.message, err.status);
    if (err instanceof RepositoryError) return fail(err.message, err.status);
    const retryable = firestoreFailure(err);
    if (retryable) return retryable;
    logRouteError("owner route error", err);
    return fail("Something went wrong on our side. Please try again.", 500);
  }
}

export async function guarded(fn: () => Promise<Response>, useFirestore = true): Promise<Response> {
  try {
    return await (useFirestore ? runTransaction(fn) : fn());
  } catch (err) {
    if (err instanceof FirebaseAccessError) return fail(err.message, err.status);
    if (err instanceof RepositoryError) return fail(err.message, err.status);
    const retryable = firestoreFailure(err);
    if (retryable) return retryable;
    logRouteError("route error", err);
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
