import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // web-push relies on Node crypto/https internals — keep it out of the bundle.
  serverExternalPackages: ["web-push"],
  async headers() {
    return [
      {
        // The worker must be allowed to control the whole origin so salon
        // pages under /s/* receive push events.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
