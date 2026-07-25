"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  KNOWLEDGE_ARTICLES,
  type KnowledgeArticle,
} from "@/lib/knowledge/articles"

export type { KnowledgeArticle }
export { KNOWLEDGE_ARTICLES }

const AUDIENCES = ["Parent", "Student", "School Admin", "Teacher", "Platform Admin"] as const
const CATEGORIES = [
  "Getting started",
  "Short Learning",
  "AI Tutor",
  "Human tutor support",
  "Subscription and billing",
  "Parent portal",
  "Student portal",
  "School and tutor support",
  "Safety and privacy",
  "FAQs",
] as const

function matchesQuery(article: KnowledgeArticle, query: string): boolean {
  if (!query.trim()) return true
  const haystack = [
    article.title,
    article.summary,
    article.category,
    ...(article.body ?? []),
    ...article.keywords,
    article.audience,
  ]
    .join(" ")
    .toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term))
}

export default function KnowledgeCentreClient() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("All")

  const filtered = useMemo(() => {
    return KNOWLEDGE_ARTICLES.filter((article) => {
      if (category !== "All" && article.category !== category) return false
      return matchesQuery(article, query)
    })
  }, [query, category])

  const grouped = useMemo(() => {
    return AUDIENCES.map((audience) => ({
      audience,
      articles: filtered.filter((article) => article.audience === audience),
    })).filter((group) => group.articles.length > 0)
  }, [filtered])

  return (
    <>
      <div className="relative mt-10 space-y-4">
        <label htmlFor="knowledge-search" className="sr-only">
          Search help articles
        </label>
        <input
          id="knowledge-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title or keyword…"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-base text-white placeholder:text-slate-500 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("All")}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              category === "All" ? "bg-violet-500 text-white" : "border border-slate-700 text-slate-300"
            }`}
          >
            All
          </button>
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                category === item ? "bg-violet-500 text-white" : "border border-slate-700 text-slate-300"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        {query.trim() || category !== "All" ? (
          <p className="text-sm text-slate-400">
            {filtered.length} article{filtered.length === 1 ? "" : "s"}
            {query.trim() ? <> matching &ldquo;{query}&rdquo;</> : null}
          </p>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
          No articles match your search. Try different keywords or browse all sections below.
        </p>
      ) : (
        <div className="mt-12 space-y-12">
          {grouped.map(({ audience, articles }) => (
            <section key={audience}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">
                {audience}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {articles.map((article) => {
                  const card = (
                    <>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {article.category}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-white">{article.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">{article.summary}</p>
                      {article.body?.length ? (
                        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-400">
                          {article.body.map((line) => (
                            <li key={line.slice(0, 40)}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                      {article.href ? (
                        <p className="mt-3 text-sm font-semibold text-violet-200">Read more &rarr;</p>
                      ) : null}
                    </>
                  )

                  if (article.href) {
                    return (
                      <Link
                        key={article.id}
                        href={article.href}
                        className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-violet-500/40 hover:bg-slate-900/80"
                      >
                        {card}
                      </Link>
                    )
                  }

                  return (
                    <article
                      key={article.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
                    >
                      {card}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-6">
        <p className="text-sm font-semibold text-violet-200">Quick links</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/faq" className="font-semibold text-violet-200 underline hover:text-white">
            FAQ
          </Link>
          <Link href="/policies" className="font-semibold text-violet-200 underline hover:text-white">
            Policies
          </Link>
          <Link href="/short-learning" className="font-semibold text-violet-200 underline hover:text-white">
            Short Learning
          </Link>
          <Link href="/ai-use" className="font-semibold text-violet-200 underline hover:text-white">
            AI transparency
          </Link>
          <Link href="/contact" className="font-semibold text-violet-200 underline hover:text-white">
            Contact us
          </Link>
        </div>
      </div>
    </>
  )
}
