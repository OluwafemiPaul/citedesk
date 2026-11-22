import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { loadArticles } from "@/lib/kb";

// Public pages, including the Ledgerly demo help center articles.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/demo", "/demo/docs", "/request-access", "/privacy", "/terms"].map((p) => ({ url: `${SITE_URL}${p}` }));
  const docs = loadArticles().map((a) => ({ url: `${SITE_URL}/demo/docs/${a.id}` }));
  return [...pages, ...docs];
}
