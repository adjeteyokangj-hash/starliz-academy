import type { Metadata } from "next";
import "./globals.css";
import PwaInstaller from "@/components/layout/PwaInstaller";
import ServiceWorkerRegistration from "@/components/layout/ServiceWorkerRegistration";
import ThemeProvider from "@/components/layout/ThemeProvider";
import OfflineBadge from "@/components/layout/OfflineBadge";
import AppSplash from "@/components/layout/AppSplash";
import StoreBootstrap from "@/components/layout/StoreBootstrap";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "StarLiz Academy",
  description: "Learn • Grow • Shine",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/starliz-logo.png?v=2", type: "image/png" },
    ],
    shortcut: [{ url: "/brand/starliz-logo.png?v=2", type: "image/png" }],
    apple: [{ url: "/brand/starliz-logo.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "StarLiz Academy",
    statusBarStyle: "default",
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
        <ServiceWorkerRegistration />
        <ThemeProvider />
        <AppSplash />
        <StoreBootstrap>{children}</StoreBootstrap>
        <footer className="mt-auto flex items-center justify-center border-t border-slate-200/70 bg-white/80 px-4 py-3 text-center text-xs font-semibold text-slate-600">
          <Logo variant="wordmark" size={24} textClassName="text-slate-700" />
        </footer>
        <OfflineBadge />
        <PwaInstaller />
      </body>
    </html>
  );
}
