import QRCode from "qrcode";
import { fail, withOwner } from "@/lib/api-helpers";
import { getSalonById } from "@/lib/salon-data";

export async function GET(request: Request) {
  return withOwner(async (user) => {
    const salon = await getSalonById(user.salonId);
    if (!salon) return fail("Salon not found", 404);

    const url = new URL(request.url);
    const origin = url.searchParams.get("origin") ?? url.origin;
    const target = `${origin}/s/${salon.slug}`;
    const download = url.searchParams.get("download") === "1";

    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: 900,
      margin: 2,
      color: { dark: "#191411", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        ...(download
          ? { "Content-Disposition": `attachment; filename="${salon.slug}-hairq-qr.png"` }
          : {}),
      },
    });
  }, request);
}
