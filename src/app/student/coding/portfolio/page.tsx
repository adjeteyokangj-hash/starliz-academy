import Link from "next/link";
import { redirect } from "next/navigation";
import LearnerProjectLibrary from "@/components/coding/LearnerProjectLibrary";
import ReadinessBridges from "@/components/coding/ReadinessBridges";
import { readSessionFromCookie } from "@/lib/auth";
import { requireCodingLearner } from "@/lib/coding/student-context";

export default async function StudentCodingPortfolioPage() {
  const session = await readSessionFromCookie();
  if (!session) redirect("/auth/login?next=/student/coding/portfolio");

  const { child } = await requireCodingLearner();

  return (
    <main className="starliz-page mx-auto max-w-5xl space-y-6 px-4 py-6 text-slate-900 sm:py-8">
      <Link href="/student/coding" className="inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-sky-800 hover:bg-sky-50">
        ← Return to Coding
      </Link>
      <h1 className="text-3xl font-black">Coding portfolio</h1>
      <div id="coding-portfolio" className="scroll-mt-4">
        <LearnerProjectLibrary />
      </div>
      <div id="practical-readiness" className="scroll-mt-4">
        <ReadinessBridges yearGroup={child?.yearGroup} />
      </div>
    </main>
  );
}
