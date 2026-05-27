"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { defaultBranding, normalizeBranding, type BrandingSettingsPayload } from "@/lib/branding"

type Props = {
  variant?: "icon" | "wordmark" | "full"
  size?: number
  animation?: boolean
  className?: string
  href?: string
  textClassName?: string
}

function imageForVariant(branding: BrandingSettingsPayload, variant: "icon" | "wordmark" | "full") {
  if (variant === "full") return branding.logoUrl
  if (variant === "icon") return branding.iconUrl
  return branding.logoUrl
}

export default function Logo({
  variant = "wordmark",
  size = 36,
  animation = true,
  className = "",
  href = "/",
  textClassName = "text-white",
}: Props) {
  const [branding, setBranding] = useState<BrandingSettingsPayload>(normalizeBranding(defaultBranding))

  useEffect(() => {
    let mounted = true
    fetch("/api/branding")
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ branding?: BrandingSettingsPayload }>
      })
      .then((payload) => {
        if (mounted) setBranding(normalizeBranding(payload?.branding ?? defaultBranding))
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  const imageSrc = useMemo(() => imageForVariant(branding, variant), [branding, variant])
  const showText = false
  const imageWidth = variant === "full"
    ? Math.max(size * 6, 260)
    : variant === "wordmark"
      ? Math.max(size * 4, 160)
      : size
  const imageHeight = variant === "icon" ? size : Math.round(imageWidth / 3.15)

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 ${animation ? "transition duration-200 motion-safe:hover:scale-[1.02]" : ""} ${className}`}
      aria-label={branding.siteName}
    >
      <Image
        src={imageSrc}
        alt="StarLiz Academy"
        width={imageWidth}
        height={imageHeight}
        priority
        unoptimized
        className={`bg-white object-contain ${variant === "icon" ? "rounded-xl p-1.5" : "rounded-xl px-3 py-2"} ${animation ? "transition duration-200 group-hover:drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]" : ""}`}
      />

      {showText && (
        <span className={`text-lg font-semibold leading-none ${textClassName}`}>
          {branding.siteName}
        </span>
      )}
    </Link>
  )
}
