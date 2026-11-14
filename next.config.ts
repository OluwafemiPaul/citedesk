import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Make sure the markdown help articles ship with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/demo-chat": ["./knowledge-base/**/*"],
    "/demo/docs/[id]": ["./knowledge-base/**/*"],
    "/demo/docs": ["./knowledge-base/**/*"],
  },
};

export default nextConfig;
