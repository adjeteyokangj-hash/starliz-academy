"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getProfile } from "@/lib/store";

function applyTheme(pathname: string) {
  const profile = getProfile();
  const isParentArea = pathname === "/parent" || pathname.startsWith("/parent/");
  const theme = isParentArea ? "default" : profile?.theme ?? "default";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-reduce-motion", profile?.settings.reduceMotion ? "true" : "false");
  document.documentElement.setAttribute("data-large-text", profile?.settings.largeText ? "true" : "false");
  document.documentElement.setAttribute("data-high-contrast", profile?.settings.highContrast ? "true" : "false");
}

export default function ThemeProvider() {
  const pathname = usePathname();

  useEffect(() => {
    applyTheme(pathname);
    const onProfileChange = () => applyTheme(pathname);
    window.addEventListener("starliz-profile-changed", onProfileChange);
    return () => {
      window.removeEventListener("starliz-profile-changed", onProfileChange);
    };
  }, [pathname]);

  return null;
}
