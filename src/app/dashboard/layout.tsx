import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { OwnerShell } from "@/components/owner/shell";
import { getPageSessionUser as getSessionUser } from "@/lib/auth";

export const metadata = { title: "HairQ Owner Console" };

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <OwnerShell
      user={{
        name: user.name,
        email: user.email,
        salonName: user.salonName,
        salonSlug: user.salonSlug,
      }}
    >
      {children}
    </OwnerShell>
  );
}
