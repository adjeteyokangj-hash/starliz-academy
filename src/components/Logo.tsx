"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { defaultBranding, type BrandingSettingsPayload } from "@/lib/branding"

type Props = {
  variant?: "icon" | "wordmark" | "full"
  size?: number
  animation?: boolean
  className?: string
  href?: string
  textClassName?: string
}

function imageForVariant(branding: BrandingSettingsPayload, variant: "icon" | "wordmark" | "full") {
  if (variant === "icon") return branding.iconUrl
  return branding.logoUrl
}

function resolveLogoSrc(src: string) {
  if (src === "/brand/starliz-logo.png") return "/brand/starliz-logo.png?v=original-logo"
  return src
}

export default function Logo({
  variant = "wordmark",
  size = 36,
  animation = true,
  className = "",
  href = "/",
  textClassName = "text-white",
}: Props) {
  const [branding, setBranding] = useState<BrandingSettingsPayload>(defaultBranding)

  useEffect(() => {
    let mounted = true
    fetch("/api/branding")
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ branding?: BrandingSettingsPayload }>
      })
      .then((payload) => {
        if (mounted && payload?.branding) setBranding(payload.branding)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  const imageSrc = useMemo(() => resolveLogoSrc(imageForVariant(branding, variant)), [branding, variant])
  const showText = variant === "wordmark"
  const imageWidth = variant === "full" ? Math.max(size * 6, 260) : size
  const imageHeight = variant === "full" ? Math.round(imageWidth / 3.15) : size

  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 ${animation ? "transition duration-200 motion-safe:hover:scale-[1.02]" : ""} ${className}`}
      aria-label={branding.siteName}
    >
      <Image
        src={imageSrc}
        alt={branding.siteName}
        width={imageWidth}
        height={imageHeight}
        priority
        unoptimized
        className={`bg-white object-contain ${variant === "full" ? "rounded-xl p-4" : "h-12 w-12 rounded p-1"} ${animation ? "transition duration-200 group-hover:drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]" : ""}`}
      />

      {showText && (
        <span className={`text-lg font-semibold leading-none ${textClassName}`}>
          {branding.siteName}
        </span>
      )}
    </Link>
  )
}
