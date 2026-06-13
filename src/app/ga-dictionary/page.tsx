"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatGaEnglishDisplayWord } from "@/lib/ga-word-bank";

type GaWord = {
  id: string;
  englishWord: string;
  gaWord: string;
  wordType: string;
  category: string;
  level: string;
  quizReady: boolean;
  storyReady: boolean;
  pronunciationHint: string | null;
};

export default function GaDictionaryPage() {
  const [words, setWords] = useState<GaWord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ga/words?limit=300")
      .then((response) => response.json() as Promise<{ items?: GaWord[] }>)
      .then((payload) => {
        if (!cancelled) setWords(payload.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredWords = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return words;
    return words.filter((word) => (
      word.englishWord.toLowerCase().includes(search)
      || word.gaWord.toLowerCase().includes(search)
      || word.category.toLowerCase().includes(search)
      || word.level.toLowerCase().includes(search)
      || word.wordType.toLowerCase().includes(search)
    ));
  }, [query, words]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/ga-learning-hub" className="text-sm font-bold text-emerald-300">Back to Ga Learning Hub</Link>
        <section className="mt-6 rounded-3xl border border-slate-800 bg-linear-to-br from-emerald-500/10 via-slate-950 to-cyan-500/10 p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Ga Dictionary</p>
          <h1 className="mt-2 text-3xl font-black">Approved Ga words and pronunciation support</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">Search the approved Ga word bank used by lessons, voice references and student-safe content.</p>
        </section>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search English, Ga, category, level or type"
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-600"
            />
          </label>
        </div>

        {loading ? <p className="mt-6 text-sm text-slate-400">Loading approved Ga words...</p> : null}

        {!loading ? (
          <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredWords.map((word) => (
              <article key={word.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">{word.category} · {word.level}</p>
                <h2 className="mt-2 text-xl font-black text-white">{formatGaEnglishDisplayWord(word)}</h2>
                <p className="mt-2 text-2xl font-black text-emerald-100">{word.gaWord}</p>
                <p className="mt-2 text-sm text-slate-400">{word.wordType}</p>
                {word.pronunciationHint ? <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{word.pronunciationHint}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Quiz {word.quizReady ? "ready" : "no"}</span>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-300">Story {word.storyReady ? "ready" : "no"}</span>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {!loading && filteredWords.length === 0 ? <p className="mt-6 text-sm text-slate-400">No matching approved Ga words found.</p> : null}
      </div>
    </main>
  );
}