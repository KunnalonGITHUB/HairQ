import { guarded, ok } from "@/lib/api-helpers";
import { pushConfigured, pushPublicKey } from "@/lib/web-push";

/**
 * The browser needs the VAPID public key to call PushManager.subscribe().
 * Served at runtime (rather than inlined at build time) so rotating keys does
 * not require a rebuild.
 */
export async function GET() {
  return guarded(async () =>
    ok({
      enabled: pushConfigured(),
      publicKey: pushConfigured() ? pushPublicKey() : null,
    }),
  );
}
