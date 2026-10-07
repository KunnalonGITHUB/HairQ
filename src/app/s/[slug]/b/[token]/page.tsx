import { BookingConfirmation } from "@/components/customer/booking-confirmation";

export const metadata = { title: "Your appointment" };

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return <BookingConfirmation slug={slug} token={token} />;
}
