import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs build into their own folder, so they never clash with a dev
  // server you have running (Next locks one dev server per build folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  cacheComponents: true,
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
