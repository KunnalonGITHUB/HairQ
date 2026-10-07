import { Suspense } from "react";
import { BookFlow } from "@/components/customer/book-flow";

export const metadata = { title: "Book an appointment" };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-20 text-sm text-muted">Loading…</div>}>
      <BookFlow slug={slug} />
    </Suspense>
  );
}
