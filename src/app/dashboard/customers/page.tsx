import { CustomersView } from "@/components/owner/customers-view";

export const metadata = { title: "Customers · HairQ" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const sp = await searchParams;
  return <CustomersView openAdd={sp.add === "1"} />;
}
