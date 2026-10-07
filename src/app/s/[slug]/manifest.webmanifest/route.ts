import { getSalonBySlug } from "@/lib/salon-data";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const salon = await getSalonBySlug(slug);
  if (!salon) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const theme = salon.pwaThemeColor ?? salon.brandColor;
  const manifest = {
    name: salon.pwaName ?? salon.name,
    short_name: salon.pwaShortName ?? salon.name.split(" ")[0] ?? salon.name,
    description: salon.tagline ?? `Live queue and appointments for ${salon.name}.`,
    id: `/s/${salon.slug}`,
    start_url: `/s/${salon.slug}?src=pwa`,
    scope: `/s/${salon.slug}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F1EC",
    theme_color: theme,
    categories: ["lifestyle", "beauty"],
    icons: [
      {
        src: `/s/${salon.slug}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: `/s/${salon.slug}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Join the queue", url: `/s/${salon.slug}/join` },
      { name: "Book an appointment", url: `/s/${salon.slug}/book` },
      { name: "My visits", url: `/s/${salon.slug}/me` },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
