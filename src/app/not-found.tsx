import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Link not found</p>
        <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.025em]">
          This salon link doesn&apos;t exist
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          The QR code or link may have changed. Ask the salon for their current link, or head back to the
          start.
        </p>
        <Link href="/" className="btn btn-primary mt-6">
          Go to HairQ
        </Link>
      </div>
    </main>
  );
}
