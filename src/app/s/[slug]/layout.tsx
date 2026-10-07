import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { PwaBoot } from "@/components/customer/chrome";
import { NotificationPeek } from "@/components/customer/notification-peek";
import { Toaster } from "@/components/ui";
import { brandVars, getSalonBySlug } from "@/lib/salon-data";

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  if (!salon) return { title: "Salon not found" };
  const name = salon.pwaName ?? salon.name;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: salon.tagline ?? `Live queue and appointments for ${salon.name}.`,
    manifest: `/s/${slug}/manifest.webmanifest`,
    applicationName: name,
    appleWebApp: {
      capable: true,
      title: salon.pwaShortName ?? name,
      statusBarStyle: "default",
    },
    icons: {
      icon: [{ url: `/s/${slug}/icon.svg`, type: "image/svg+xml" }],
      apple: [{ url: `/s/${slug}/icon.svg` }],
    },
    openGraph: {
      title: name,
      description: salon.tagline ?? `Join the live queue at ${salon.name}.`,
      type: "website",
    },
  };
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Viewport> {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  return {
    themeColor: salon?.pwaThemeColor ?? salon?.brandColor ?? "#191411",
    width: "device-width",
    initialScale: 1,
  };
}

export default async function SalonLayout({ children, params }: Props) {
  const { slug } = await params;
  const salon = await getSalonBySlug(slug);
  if (!salon) notFound();

  return (
    <div style={brandVars(salon)} className="min-h-dvh bg-paper pb-10">
      {/* `beforeinstallprompt` can fire before React hydrates, so capture it
          here and hand it to the install store once the app is interactive. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{window.__hairqInstall=window.__hairqInstall||null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hairqInstall=e;window.dispatchEvent(new Event('hairq:installready'));});window.addEventListener('appinstalled',function(){window.__hairqInstall=null;window.__hairqInstalled=true;window.dispatchEvent(new Event('hairq:installed'));});}catch(_){}})();`,
        }}
      />
      {children}
      <PwaBoot slug={slug} />
      <NotificationPeek />
      <Toaster />
    </div>
  );
}
