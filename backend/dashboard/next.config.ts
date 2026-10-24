import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // A self-contained server build for Docker (dashboard/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Teammates open the dev server through a Cloudflare tunnel on this host.
  allowedDevOrigins: ["maasinga.devoup.com"],
};

export default nextConfig;
