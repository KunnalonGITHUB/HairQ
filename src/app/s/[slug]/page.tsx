import { SalonHome } from "@/components/customer/salon-home";

export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SalonHome slug={slug} />;
}
