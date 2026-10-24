import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A self-contained server build for Docker (dashboard/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // The login gate (AuthGate) renders pages only on the client, so dev-mode instant-navigation checks
  // would flag every page; check only segments that ask for it.
  experimental: {
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  // Teammates open the dev server through a Cloudflare tunnel on this host.
  allowedDevOrigins: ["maasinga.devoup.com"],
};

export default nextConfig;
