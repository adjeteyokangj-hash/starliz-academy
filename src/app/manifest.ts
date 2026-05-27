import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StarLiz Academy",
    short_name: "StarLiz",
    description: "StarLiz Academy — Learn • Grow • Shine",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0C132D",
    theme_color: "#0C132D",
    icons: [
      {
        src: "/brand/starliz-logo.png",
        type: "image/png",
      },
      {
        src: "/favicon.png",
        type: "image/png",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard-desktop.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
        label: "StarLiz dashboard on desktop",
      },
      {
        src: "/screenshots/dashboard-mobile.png",
        sizes: "720x1280",
        type: "image/png",
        label: "StarLiz dashboard on mobile",
      },
    ],
    prefer_related_applications: false,
    categories: ["education", "games"],
    shortcuts: [
      {
        name: "Spelling Quest",
        short_name: "Spelling",
        description: "Jump into spelling practice",
        url: "/games/spelling",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Math Mission",
        short_name: "Math",
        description: "Practice adaptive maths questions",
        url: "/games/math",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Reading Journey",
        short_name: "Reading",
        description: "Build reading comprehension",
        url: "/games/reading",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
