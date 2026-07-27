"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminButtonLink, AdminPageHeader } from "@/components/admin/ui";
import ShortLearningLessonReviewBody from "@/components/admin/short-learning/ShortLearningLessonReviewBody";
import {
  canApprovePlayableLesson,
  parsePlayableLessonContent,
} from "@/lib/schools/parse-playable-lesson-content";

type Block = {
  id: string;
  order: number;
  title: string;
  blockType: string;
  estimatedMinutes: number;
  daytimeStage: string | null;
  learningObjective: string | null;
  reviewStatus: string;
  contentId: string | null;
  content?: {
    id: string;
    status: string;
    contentType: string;
    topic: string;
    model: string | null;
    contentJson: string;
    metadataJson: string | null;
  } | null;
};

type Journey = {
  id: string;
  schoolId: string;
  subject: string;
  yearGroup: string;
  durationMinutes: number;
  topic: string;
  status: string;
  version: number;
  school?: { id: string; name: string };
  blocks: Block[];
};

function AcademicBlockCard({
  journey,
  block,
  busy,
  onRun,
}: {
  journey: Journey;
  block: Block;
  busy: boolean;
  onRun: (path: string, body?: Record<string, unknown>) => Promise<void>;
}) {
  const structural = !block.daytimeStage;
  const parsed = useMemo(() => {
    if (structural) return null;
    if (!block.contentId || !block.content?.contentJson) {
      return parsePlayableLessonContent(null);
    }
    return parsePlayableLessonContent(block.content.contentJson, {
      contentType: block.content.contentType,
      subject: journey.subject,
      skillFocus: journey.topic,
      topic: block.content.topic,
    });
  }, [structural, block.contentId, block.content, journey.subject, journey.topic]);

  const approveAllowed = !structural && parsed ? canApprovePlayableLesson(parsed) : false;
  const approveDisabledReason = structural
    ? null
    : !block.contentId
      ? "Block has no content reference."
      : !parsed
        ? "Lesson content unavailable."
        : !parsed.ok
          ? parsed.error
          : parsed.approvalDenialReasons[0] ?? (!approveAllowed ? "Lesson body incomplete." : null);

  return (
    <article
      className="rounded-[var(--admin-radius-lg)] border border-[var(--admin-border)] p-5"
      style={{ background: "var(--admin-surface)", boxShadow: "var(--admin-shadow-sm)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
            Block {block.order} · {block.blockType} · {block.estimatedMinutes}m
            {block.daytimeStage ? ` · stage ${block.daytimeStage}` : " · structural"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--admin-text)]">{block.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--admin-muted)]">
            {block.learningObjective || "No academic objective (non-generative)"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
            Review: {block.reviewStatus}
            {block.content
              ? ` · content ${block.content.status} · ${block.content.contentType} · model ${block.content.model ?? "n/a"}`
              : ""}
          </p>
        </div>
        {!structural ? (
          <div className="flex flex-wrap gap-2">
            {block.contentId ? (
              <Link
                className="rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-text)]"
                href={`/admin/content-library?view=${block.contentId}`}
              >
                Edit in Content Library
              </Link>
            ) : null}
            <button
              type="button"
              disabled={busy || !block.contentId}
              className="rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-text)] disabled:opacity-50"
              onClick={() =>
                void onRun(
                  `/api/admin/short-learning/journeys/${journey.id}/blocks/${block.id}/ai-correct`,
                  { action: "british_english" },
                )
              }
            >
              AI: British English
            </button>
            <button
              type="button"
              disabled={busy || !block.contentId}
              className="rounded-[var(--admin-radius)] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-text)] disabled:opacity-50"
              onClick={() =>
                void onRun(`/api/admin/short-learning/journeys/${journey.id}/blocks/${block.id}/regenerate`)
              }
            >
              Regenerate block
            </button>
            <button
              type="button"
              disabled={busy || block.reviewStatus === "approved" || !approveAllowed}
              title={approveDisabledReason ?? undefined}
              className="rounded-[var(--admin-radius)] bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() =>
                void onRun(`/api/admin/short-learning/journeys/${journey.id}/blocks/${block.id}/approve`)
              }
            >
              Approve block
            </button>
          </div>
        ) : null}
      </div>

      {structural ? (
        <p className="mt-3 text-sm text-[var(--admin-muted)]">
          Structural block — no generated academic lesson content
        </p>
      ) : parsed ? (
        <>
          {!approveAllowed && approveDisabledReason ? (
            <p className="mt-3 text-xs text-amber-200">Cannot approve yet: {approveDisabledReason}</p>
          ) : null}
          <ShortLearningLessonReviewBody parsed={parsed} defaultOpen={block.order <= 3} />
        </>
      ) : null}
    </article>
  );
}

export default function ShortLearningJourneyReviewPage() {
  const params = useParams<{ journeyId: string }>();
  const journeyId = params.journeyId;
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/short-learning/journeys/${journeyId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load");
    setJourney(data.journey);
  }, [journeyId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/short-learning/journeys/${journeyId}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        return data.journey as Journey;
      })
      .then((data) => setJourney(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => controller.abort();
  }, [journeyId]);

  async function run(path: string, body?: Record<string, unknown>) {
    if (!journey) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: journey.schoolId, ...(body ?? {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (Array.isArray(data.failures) ? data.failures.join("; ") : "Action failed"));
      }
      setMessage("Updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!journey) {
    return <p className="p-6 text-sm text-[var(--admin-muted)]">{error ?? "Loading journey…"}</p>;
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Short Learning review"
        title={`${journey.subject} · ${journey.yearGroup} · ${journey.durationMinutes}m`}
        subtitle={`${journey.school?.name ?? "School"} · ${journey.topic || "No topic"} · status ${journey.status}`}
        actions={
          <>
            <AdminButtonLink href="/admin/short-learning/journeys?status=awaiting_review" variant="secondary">
              Back to queue
            </AdminButtonLink>
            <button
              type="button"
              disabled={busy}
              className="rounded-[var(--admin-radius)] bg-[var(--admin-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--admin-primary-hover)] disabled:opacity-50"
              onClick={() => void run(`/api/admin/short-learning/journeys/${journey.id}/publish`)}
            >
              Publish journey
            </button>
          </>
        }
      />

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="space-y-4">
        {journey.blocks.map((block) => (
          <AcademicBlockCard
            key={block.id}
            journey={journey}
            block={block}
            busy={busy}
            onRun={run}
          />
        ))}
      </div>
    </div>
  );
}
