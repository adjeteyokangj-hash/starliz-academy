"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { defaultBranding, normalizeBranding, type BrandingSettingsPayload } from "@/lib/branding"

type LogoVariant = "icon" | "wordmark" | "full" | "header" | "footer"

type Props = {
  variant?: LogoVariant
  size?: number
  animation?: boolean
  className?: string
  href?: string
  textClassName?: string
}

function imageForVariant(branding: BrandingSettingsPayload, variant: LogoVariant) {
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
  // The brand asset is square, so the footer lock-up is a square box pinned with an inline
  // style: globals.css declares an unlayered `img { height: auto }` rule that outranks every
  // Tailwind height utility and would otherwise stretch the mark toward its intrinsic 1254px.
  const isFooter = variant === "footer"
  const imageWidth = isFooter
    ? size
    : variant === "full"
      ? Math.max(size * 6, 260)
      : variant === "header"
        ? Math.max(size * 4, 150)
      : variant === "wordmark"
        ? Math.max(size * 4, 160)
        : size
  const imageHeight = variant === "icon" || isFooter ? size : variant === "header" ? Math.max(size * 2, 130) : Math.round(imageWidth / 3.15)

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
        style={isFooter ? { width: size, height: size } : undefined}
        className={`bg-white object-contain ${variant === "icon" ? "rounded-xl p-1.5" : isFooter ? "rounded-lg p-1" : variant === "header" ? "h-11 w-12 rounded-lg px-2 py-1 sm:h-14 sm:w-16 sm:px-2.5 sm:py-1.5" : "rounded-xl px-3 py-2"} ${animation ? "transition duration-200 group-hover:drop-shadow-[0_0_10px_rgba(99,102,241,0.6)]" : ""}`}
      />

      {showText && (
        <span className={`text-lg font-semibold leading-none ${textClassName}`}>
          {branding.siteName}
        </span>
      )}
    </Link>
  )
}
