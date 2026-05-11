import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StarLiz Academy",
    short_name: "StarLiz",
    description: "Learn. Play. Grow.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0C132D",
    theme_color: "#6366F1",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      }
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
