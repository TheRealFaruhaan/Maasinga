import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is previewed on its own private subdomain (production
  // runs as a separate service on maasinga-web).
  allowedDevOrigins: ["maasinga-dev.dev.faruhaan.com"],
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
