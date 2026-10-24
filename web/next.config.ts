import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the phone preview on the Crundi subdomain use dev-only assets/HMR.
  allowedDevOrigins: ["maasinga-web.dev.faruhaan.com"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
