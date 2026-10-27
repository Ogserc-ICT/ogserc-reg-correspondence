import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs build into their own folder, so they never clash with a dev
  // server you have running (Next locks one dev server per build folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  // The PDF routes read the fonts (and logo) from assets/ at run time; on
  // Vercel, files a function reads must be traced into its bundle.
  outputFileTracingIncludes: {
    "/slip": ["./assets/**/*"],
    "/inward/*/slip": ["./assets/**/*"],
    "/daily/pdf": ["./assets/**/*"],
    "/pending/pdf": ["./assets/**/*"],
  },
  // An in-house system on a public address: keep it out of search engines.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  // forbidden() for pages a role may not open (SPEC §10).
  experimental: { authInterrupts: true },
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
