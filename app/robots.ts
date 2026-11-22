import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

// Keeps crawlers (including CiteDesk's own importer) out of private pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/owner", "/api", "/auth", "/login"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
