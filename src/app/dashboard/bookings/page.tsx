import { BookingsView } from "@/components/owner/bookings-view";

export const metadata = { title: "Bookings · HairQ" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const sp = await searchParams;
  return <BookingsView openAdd={sp.add === "1"} />;
}
