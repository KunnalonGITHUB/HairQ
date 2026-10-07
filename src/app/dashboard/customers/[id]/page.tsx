import { CustomerProfile } from "@/components/owner/customers-view";

export const metadata = { title: "Customer · HairQ" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerProfile id={Number(id)} />;
}
