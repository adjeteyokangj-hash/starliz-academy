import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["imapflow", "nodemailer"],
  // Production build type-checks shipped code only. Non-shipped test/UAT tooling
  // (tests/, scripts/) is type-checked separately via `npm run typecheck:full`.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  experimental: {
    // Lesson-pack bulk import accepts up to 300MB combined multipart uploads.
    serverActions: {
      bodySizeLimit: "300mb",
    },
    proxyClientMaxBodySize: "300mb",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/screenshots/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
