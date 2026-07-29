import Link from "next/link";
import Logo from "@/components/Logo";
import PublicMiniFooter from "@/components/public/PublicMiniFooter";

export const dynamic = "force-dynamic";

export default function SchoolPortalUnavailablePage() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
        <Logo variant="wordmark" size={28} animation={false} className="mb-8" textClassName="text-slate-900" />
        <h1 className="font-heading text-3xl font-black tracking-tight text-slate-900">
          School Portal unavailable
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The School Portal is temporarily unavailable. Please try again later or contact StarLiz Academy support.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          This page does not redirect automatically.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/auth/login"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Back to sign in
          </Link>
          <Link
            href="/contact"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Contact support
          </Link>
        </div>
      </div>
      <PublicMiniFooter />
    </main>
  );
}
