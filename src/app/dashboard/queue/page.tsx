import { QueueBoard } from "@/components/owner/queue-board";

export const metadata = { title: "Live Queue · HairQ" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const sp = await searchParams;
  return <QueueBoard openAdd={sp.add === "1"} />;
}
