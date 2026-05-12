"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#08111f] px-6 py-20 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-950/80 p-8 text-center shadow-2xl shadow-slate-950/30">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Admin Portal Error</p>
        <h1 className="mt-3 text-3xl font-black">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          The admin area hit a server or rendering error. Use retry to reload this page, or go back to the dashboard.
        </p>
        {error.digest ? <p className="mt-4 text-xs text-slate-500">Error ID: {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-500"
          >
            Retry
          </button>
          <Link
            href="/admin"
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
