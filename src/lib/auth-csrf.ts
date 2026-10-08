import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { FirebaseAccessError } from "./firebase/auth";
const COOKIE = "hq_auth_csrf";
function applicationOrigin(request: Request): string {
  const configured = process.env.HAIRQ_APP_ORIGIN?.trim();
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('HairQ application origin configuration is invalid.');
    return url.origin;
  }
  // Next.js may construct request.url using an internal server hostname.
  // Browsers cannot override Host; never trust a forwarded host for this check.
  const host = request.headers.get('host');
  if (host && !/^[a-zA-Z0-9.\-:\[\]]+$/.test(host)) throw new FirebaseAccessError('Request origin denied.', 403);
  return host ? new URL(`${new URL(request.url).protocol}//${host}`).origin : new URL(request.url).origin;
}
export async function issueAuthCsrf(request: Request): Promise<string> {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== applicationOrigin(request))) throw new FirebaseAccessError("Request origin denied.", 403);
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString("hex");
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 14 * 86400 });
  return token;
}
export async function assertAuthMutation(request: Request): Promise<void> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("origin") !== applicationOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") throw new FirebaseAccessError("Request origin denied.", 403);
  const expected = (await cookies()).get(COOKIE)?.value ?? "";
  const actual = request.headers.get("x-hairq-csrf") ?? "";
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual) || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new FirebaseAccessError("Request verification failed. Please reload and try again.", 403);
}
