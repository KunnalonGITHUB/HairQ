import { DashboardView } from "@/components/owner/dashboard-view";
import { getSessionUser } from "@/lib/auth";

export default async function Page() {
  const user = await getSessionUser();
  return <DashboardView ownerName={user?.name ?? "there"} />;
}
