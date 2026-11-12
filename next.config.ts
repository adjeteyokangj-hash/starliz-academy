import type { NextConfig } from "next";

const lowResourceVerificationBuild = process.env.CODING_VERIFY_LOW_RESOURCE_BUILD === "true";
const ownedQaBuild = process.env.NODE_ENV === "development" && /^[a-f0-9-]{36}$/.test(process.env.CODING_QA_BUILD_ID ?? "");
function isolatedWorldQaDatabase() {
  if (process.env.STARLIZ_WORLD_DB_QA !== "1" || !ownedQaBuild) return false;
  try {
    const target = new URL(process.env.DATABASE_URL ?? "");
    return target.protocol === "postgresql:" && target.hostname === "127.0.0.1" && target.port === "55432" && target.pathname === "/starliz_game_world_test" && target.searchParams.get("sslmode") === "disable" && process.env.DIRECT_URL === process.env.DATABASE_URL;
  } catch {
    return false;
  }
}
const reusableWorldQaBuild = isolatedWorldQaDatabase();
const ownedProductionBuild = lowResourceVerificationBuild && /^[a-f0-9-]{36}$/.test(process.env.CODING_VERIFY_BUILD_ID ?? "");
const verificationWebpack: NonNullable<NextConfig["webpack"]> = (config) => {
  config.cache = false;
  return config;
};

const nextConfig: NextConfig = {
  ...(ownedProductionBuild ? { distDir: `.next-coding-build/${process.env.CODING_VERIFY_BUILD_ID}` } : reusableWorldQaBuild
    ? { distDir: ".next-coding-qa/world-uat" } : ownedQaBuild
    ? { distDir: `.next-coding-qa/${process.env.CODING_QA_BUILD_ID}` } : {}),
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["imapflow", "nodemailer"],
  ...(lowResourceVerificationBuild ? { webpack: verificationWebpack } : {}),
  // Production build type-checks shipped code only. Non-shipped test/UAT tooling
  // (tests/, scripts/) is type-checked separately via `npm run typecheck:full`.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  experimental: {
    ...(ownedQaBuild ? { turbopackFileSystemCacheForDev: false } : {}),
    // Opt-in local verification limits workers and avoids persistent build caches.
    ...(lowResourceVerificationBuild ? { cpus: 1, webpackBuildWorker: true, webpackMemoryOptimizations: true } : {}),
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
