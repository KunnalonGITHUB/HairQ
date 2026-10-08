import { createSession, destroySession, requireRecentSignIn } from "@/lib/auth";
import { fail, guarded, ok, str } from "@/lib/api-helpers";
import { createSalonWorkspace } from "@/lib/onboarding";
import { assertAuthMutation, issueAuthCsrf } from "@/lib/auth-csrf";
import { verifyFirebaseIdToken, FirebaseAccessError } from "@/lib/firebase/auth";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export async function GET(request: Request) {
  return guarded(async () => ok({ csrfToken: await issueAuthCsrf(request) }), false);
}
export async function POST(request: Request) {
  return guarded(async () => {
    await assertAuthMutation(request);
    const raw = await request.json().catch(() => null);
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const action = str(body.action);
    if (action === "logout") { await destroySession(); return ok({ ok: true }); }
    if (action !== "login" && action !== "signup") return fail("Unknown action.");
    const idToken = str(body.idToken);
    if (action === "signup") {
      const salonName = str(body.salonName), ownerName = str(body.ownerName);
      if (!salonName) return fail("Tell us your salon's name.");
      if (!ownerName) return fail("Tell us your name.");
      const token = await verifyFirebaseIdToken(idToken);
      requireRecentSignIn(token);
      const account = await getFirebaseAdminAuth().getUser(token.uid);
      if (account.disabled || !account.email) throw new FirebaseAccessError("This account cannot provision a salon.", 403);
      await createSalonWorkspace({uid:token.uid,email:account.email.toLowerCase(),salonName,ownerName,phone:str(body.phone)||undefined,city:str(body.city)||undefined});
    }
    const user = await createSession(idToken);
    return ok({ ok: true, slug: user.salonSlug }, action === "signup" ? 201 : 200);
  }, false);
}
