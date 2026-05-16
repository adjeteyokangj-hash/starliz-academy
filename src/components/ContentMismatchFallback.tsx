"use client";

import Link from "next/link";

interface ContentMismatchFallbackProps {
  subject: string;
  message: string;
  childDashboardHref?: string;
}

export default function ContentMismatchFallback({
  subject,
  message,
  childDashboardHref = "/student/dashboard",
}: ContentMismatchFallbackProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-rose-50 via-orange-50 to-red-50 px-4">
      <div className="rounded-3xl bg-white p-8 shadow-2xl sm:max-w-md">
        <div className="mb-6 text-center">
          <span className="mb-4 block text-6xl">⚠️</span>
          <h1 className="text-2xl font-black text-rose-900">Activity Mismatch</h1>
        </div>

        <p className="mb-6 text-center text-slate-700">
          {message || `This activity does not match ${subject}. Please return to your dashboard or ask your parent/admin to reassign it.`}
        </p>

        <div className="space-y-3">
          <Link
            href={childDashboardHref}
            className="block rounded-2xl bg-emerald-600 px-6 py-3 text-center font-bold text-white hover:bg-emerald-700"
          >
            Return to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="block w-full rounded-2xl border-2 border-slate-300 px-6 py-3 text-center font-bold text-slate-700 hover:bg-slate-100"
          >
            Go Back
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          If you believe this is an error, please contact your parent or teacher.
        </p>
      </div>
    </div>
  );
}
