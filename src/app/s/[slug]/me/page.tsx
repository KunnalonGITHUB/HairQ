import { notFound } from "next/navigation";
import { MyVisits } from "@/components/customer/my-visits";
import { getSalonBySlug } from "@/lib/salon-data";

export const metadata = { title: "Your visits" };

export default async function MePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  if (!salon) notFound();
  return <MyVisits slug={slug} salonName={salon.name} salonLogoUrl={salon.logoUrl} />;
}
