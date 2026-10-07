import { TicketScreen } from "@/components/customer/ticket-screen";

export const metadata = { title: "Your place in the queue" };

export default async function TicketPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  return <TicketScreen slug={slug} token={token} />;
}
