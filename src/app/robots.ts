import type { MetadataRoute } from "next";

/** In-house system: no search engine may index any of it. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
