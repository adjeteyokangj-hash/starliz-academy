const ROUTES = [
  "/",
  "/pricing",
  "/login",
  "/register",
  "/forgot-password",
  "/parent/dashboard",
  "/parent/children",
  "/parent/billing",
  "/parent/progress",
  "/parent/security",
  "/student/dashboard",
  "/admin",
  "/admin/parents",
  "/admin/students",
  "/games/spelling",
  "/games/lesson",
];

const CHECKS = [
  "No horizontal scrolling at 375px width",
  "Primary buttons remain tappable with comfortable spacing",
  "Parent forms are fully completable on mobile",
  "Student games support touch input",
  "Admin tables/cards remain readable on mobile",
];

export default function MobileQaChecklistPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/40 sm:p-5 lg:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Quality Assurance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Mobile QA Checklist</h1>
        <p className="mt-3 text-sm text-slate-300">
          Track responsive verification across core StarLiz experiences before deployment.
        </p>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-white">Routes To Test</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ROUTES.map((route) => (
              <li key={route} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                {route}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-white">Validation Checks</h2>
          <ul className="mt-3 space-y-2">
            {CHECKS.map((check) => (
              <li key={check} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                {check}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
