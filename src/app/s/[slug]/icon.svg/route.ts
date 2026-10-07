import { getSalonBySlug, initials } from "@/lib/salon-data";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const salon = await getSalonBySlug(slug);
  const color = salon?.pwaThemeColor ?? salon?.brandColor ?? "#BC5A2E";
  const label = salon ? initials(salon.name) : "HQ";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="${color}cc"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="104" fill="url(#g)"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="10"/>
  <text x="50%" y="50%" dy="0.355em" text-anchor="middle"
    font-family="Inter, Helvetica, Arial, sans-serif" font-size="212" font-weight="600"
    letter-spacing="-6" fill="#ffffff">${label}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
}
