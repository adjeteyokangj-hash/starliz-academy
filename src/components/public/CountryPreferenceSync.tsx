"use client"

import { useEffect } from "react"

type CountryPreferenceSyncProps = {
  countryCode: "uk" | "ghana" | "nigeria"
}

export default function CountryPreferenceSync({ countryCode }: CountryPreferenceSyncProps) {
  useEffect(() => {
    try {
      localStorage.setItem("starliz_country", countryCode)
    } catch {
      // Local storage can be unavailable in some browser privacy modes.
    }

    document.cookie = `starliz_country=${countryCode}; path=/; max-age=31536000; samesite=lax`
  }, [countryCode])

  return null
}
