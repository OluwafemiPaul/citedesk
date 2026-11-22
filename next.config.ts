import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Make sure the markdown help articles ship with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/demo-chat": ["./knowledge-base/**/*"],
    "/demo/docs/[id]": ["./knowledge-base/**/*"],
    "/demo/docs": ["./knowledge-base/**/*"],
    "/sitemap.xml": ["./knowledge-base/**/*"],
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      // Only the chat window may be shown inside other websites; every other page refuses framing.
      { source: "/((?!embed/).*)", headers: [...common, { key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      { source: "/embed/:path*", headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      { source: "/widget.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
