import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

const games = [
  {
    title: "Spelling",
    href: "/games/spelling",
    icon: "abc",
    description: "Practise words, sounds, hints, and sentences with adaptive spelling challenges.",
    accent: "from-sky-500 to-blue-600",
  },
  {
    title: "Maths",
    href: "/games/math",
    icon: "123",
    description: "Build number confidence with questions that adjust as each child improves.",
    accent: "from-emerald-500 to-teal-600",
  },
  {
    title: "Reading",
    href: "/games/reading",
    icon: "Aa",
    description: "Read short passages, answer questions, and grow comprehension skills.",
    accent: "from-violet-500 to-fuchsia-600",
  },
];

export default function GamesPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      <section className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
            Learning Games
          </p>
          <h1 className="mt-3 font-heading text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
            Choose a game and keep learning.
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Pick spelling, maths, or reading. Each activity helps StarLiz adapt the next lesson
            to the child&apos;s progress.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {games.map((game) => (
            <Link
              key={game.title}
              href={game.href}
              className="group rounded-[1.75rem] border border-(--ring-color) bg-(--surface) p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${game.accent} text-xl font-black text-white shadow-lg`}
              >
                {game.icon}
              </div>
              <h2 className="mt-5 font-heading text-2xl font-black text-slate-900">
                {game.title}
              </h2>
              <p className="mt-3 min-h-24 text-sm leading-6 text-slate-600">
                {game.description}
              </p>
              <span className="mt-5 inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white transition group-hover:bg-primary/90">
                Play {game.title}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
