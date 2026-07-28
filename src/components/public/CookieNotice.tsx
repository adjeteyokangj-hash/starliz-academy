"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

/** Preference cookie + mirrored localStorage key for the essential-cookies notice. */
export const COOKIE_NOTICE_KEY = "starliz_cookie_notice_v1"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

const PUBLIC_PREFIXES = [
  "/",
  "/uk",
  "/ghana",
  "/nigeria",
  "/about",
  "/features",
  "/pricing",
  "/short-learning",
  "/contact",
  "/faq",
  "/knowledge-centre",
  "/policies",
  "/privacy",
  "/terms",
  "/cookies",
  "/ai-use",
  "/safeguarding-policy",
  "/data-retention",
  "/signup",
  "/auth",
]

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
  if (!match) return null
  return decodeURIComponent(match.slice(name.length + 1))
}

function writeNoticeAcknowledged() {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = [
    `${COOKIE_NOTICE_KEY}=acknowledged`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ")
  try {
    window.localStorage.setItem(COOKIE_NOTICE_KEY, "acknowledged")
  } catch {
    // Cookie is the primary store; localStorage is best-effort.
  }
}

function hasAcknowledgedNotice(): boolean {
  if (readCookie(COOKIE_NOTICE_KEY) === "acknowledged") return true
  try {
    return window.localStorage.getItem(COOKIE_NOTICE_KEY) === "acknowledged"
  } catch {
    return false
  }
}

export default function CookieNotice() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const acknowledged = hasAcknowledgedNotice()
      // Migrate older localStorage-only acknowledgments into a real cookie.
      if (acknowledged && readCookie(COOKIE_NOTICE_KEY) !== "acknowledged") {
        writeNoticeAcknowledged()
      }
      setVisible(!acknowledged)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const isPublic = PUBLIC_PREFIXES.some((prefix) => (
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  if (!visible || !isPublic) return null

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl border border-slate-600 bg-slate-950 px-5 py-4 text-sm text-slate-100 shadow-2xl sm:inset-x-auto sm:right-6 sm:left-auto sm:bottom-6"
    >
      <p className="leading-6 text-slate-200">
        StarLiz currently uses essential cookies and local storage for secure access,
        preferences and reliable operation. We do not use optional advertising cookies.{" "}
        <Link href="/cookies" className="font-semibold text-blue-300 underline underline-offset-2 hover:text-white">
          Read the Cookie Policy
        </Link>
        .
      </p>
      <button
        type="button"
        className="mt-4 w-full bg-blue-600 px-5 py-2.5 font-bold text-white transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        onClick={() => {
          writeNoticeAcknowledged()
          setVisible(false)
        }}
      >
        Understood
      </button>
    </aside>
  )
}