import type { MetadataRoute } from "next";

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!configured) return "http://localhost:3000";
  return configured.replace(/\/$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl();
  const routes = [
    "/",
    "/onboarding",
    "/dashboard",
    "/parent",
    "/profiles",
    "/pet",
    "/rewards",
    "/games/spelling",
    "/games/math",
    "/games/reading",
    "/offline",
  ];

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "daily",
    priority: route === "/" ? 1 : 0.7,
  }));
}
