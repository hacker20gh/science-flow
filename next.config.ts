import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse-new", "pdf-parse", "formidable"],

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "recharts",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "sciflow-term",
  project: "javascript-nextjs",
});
