"use client";

import { useState } from "react";

type CertificateShareControlsProps = {
  verificationUrl: string;
  className?: string;
  compact?: boolean;
};

function toAbsoluteUrl(value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (typeof window === "undefined") return value;
  return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
}

export default function CertificateShareControls(props: CertificateShareControlsProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function copyLink() {
    const url = toAbsoluteUrl(props.verificationUrl);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Verification link copied.");
    } catch {
      setMessage("Unable to copy link.");
    }
  }

  async function nativeShare() {
    const url = toAbsoluteUrl(props.verificationUrl);
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      setMessage("Native sharing is not available on this device.");
      return;
    }

    try {
      await navigator.share({
        title: "StarLiz Certificate Verification",
        text: "Verify this StarLiz certificate using the secure link.",
        url,
      });
      setMessage("Verification link shared.");
    } catch {
      setMessage("Share cancelled.");
    }
  }

  const absoluteUrl = toAbsoluteUrl(props.verificationUrl);
  const mailto = `mailto:?subject=${encodeURIComponent("StarLiz Certificate Verification Link")}&body=${encodeURIComponent(`Use this secure verification link:\n\n${absoluteUrl}`)}`;

  return (
    <div className={props.className ?? "space-y-1"}>
      <div className={`flex flex-wrap gap-2 ${props.compact ? "text-[11px]" : "text-xs"}`}>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded border border-slate-400 px-2 py-1 font-bold text-slate-700 hover:bg-slate-100"
        >
          Copy verification link
        </button>
        <a
          href={mailto}
          className="rounded border border-cyan-400 px-2 py-1 font-bold text-cyan-700 hover:bg-cyan-50"
        >
          Email verification link
        </a>
        <button
          type="button"
          onClick={() => void nativeShare()}
          className="rounded border border-emerald-400 px-2 py-1 font-bold text-emerald-700 hover:bg-emerald-50"
        >
          Share link
        </button>
      </div>
      {message ? <p className="text-[11px] text-slate-500">{message}</p> : null}
    </div>
  );
}
