import { Suspense } from "react";
import { NotificationsComposer } from "@/components/owner/engagement";
import { getPageSessionUser as getSessionUser } from "@/lib/auth";
import { getSalonById } from "@/lib/salon-data";

export const metadata = { title: "Notifications · HairQ" };

export default async function Page() {
  const user = await getSessionUser();
  const salon = user ? await getSalonById(user.salonId) : null;
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-line/40" />}>
      <NotificationsComposer
        salonName={salon?.name ?? user?.salonName ?? "Your salon"}
        salonSlug={salon?.slug ?? user?.salonSlug}
        salonLogoUrl={salon?.logoUrl ?? null}
      />
    </Suspense>
  );
}
