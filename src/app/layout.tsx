import type { Metadata } from "next";
import "./globals.css";
import PwaInstaller from "@/components/layout/PwaInstaller";
import ChunkLoadRecovery from "@/components/layout/ChunkLoadRecovery";
import ServiceWorkerRegistration from "@/components/layout/ServiceWorkerRegistration";
import ThemeProvider from "@/components/layout/ThemeProvider";
import OfflineBadge from "@/components/layout/OfflineBadge";
import AppSplash from "@/components/layout/AppSplash";
import StoreBootstrap from "@/components/layout/StoreBootstrap";

export const metadata: Metadata = {
  title: "StarLiz Academy | AI-Supported Learning for Children",
  description: "StarLiz Academy helps children learn with adaptive lessons, smart catch-up, guided practice, curriculum mastery tracking, parent visibility, and exam readiness support.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.png", type: "image/png" }],
    apple: [{ url: "/favicon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "StarLiz Academy | AI-Supported Learning for Children",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "StarLiz Academy | AI-Supported Learning for Children",
    description: "StarLiz Academy helps children learn with adaptive lessons, smart catch-up, guided practice, curriculum mastery tracking, parent visibility, and exam readiness support.",
    images: ["/brand/starliz-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <ChunkLoadRecovery />
        <ServiceWorkerRegistration />
        <ThemeProvider />
        <AppSplash />
        <StoreBootstrap>{children}</StoreBootstrap>
        <footer className="mt-auto border-t border-slate-200/70 bg-white/80 px-3 py-1 text-center text-[9px] font-medium leading-none text-slate-500">
          <p>StarLiz Academy — Learn • Grow • Shine</p>
        </footer>
        <OfflineBadge />
        <PwaInstaller />
      </body>
    </html>
  );
}
