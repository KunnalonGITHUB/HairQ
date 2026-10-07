import { Suspense } from "react";
import { JoinFlow } from "@/components/customer/join-flow";

export const metadata = { title: "Join the queue" };

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-20 text-sm text-muted">Loading…</div>}>
      <JoinFlow slug={slug} />
    </Suspense>
  );
}
