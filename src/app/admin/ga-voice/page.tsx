"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { GA_CATEGORIES, GA_LEVELS } from "@/lib/ga-word-bank";

type VoiceMetrics = {
  totalAudioAssets: number;
  aiGeneratedFiles: number;
  approvedForEarlyLearning: number;
  nativeVerified: number;
  rejectedAudio: number;
  approvedWords: number;
  pendingAudioWords: number;
  approvedAudioWords: number;
  wordsMissingAudio: number;
  needsNativeReview: number;
  lessonsCount: number;
  lessonAudioMissing: number;
  studentRecordingsAwaitingReview: number;
  songsPendingApproval: number;
  reviewedAt: string;
};

type ReferenceRow = {
  id: string;
  referenceType: string;
  sourceUrl: string;
  sourceTitle: string | null;
  timestampStart: string | null;
  timestampEnd: string | null;
  linkedSound: string | null;
  linkedLetter: string | null;
  pronunciationNote: string | null;
  permissionStatus: string;
  reviewStatus: string;
  createdAt: string;
};

type RecordingRow = {
  id: string;
  reviewStatus: string;
  adminFeedback: string | null;
  createdAt: string;
  student: { id: string; name: string };
  word: { id: string; englishWord: string; gaWord: string } | null;
  lesson: { id: string; title: string } | null;
};

type SongRow = {
  id: string;
  title: string;
  level: string;
  category: string;
  reviewStatus: string;
  audioReadiness: "UNAPPROVED_WORDS" | "MISSING_AUDIO" | "AUDIO_NOT_STUDENT_SAFE" | "READY_FOR_APPROVAL" | "APPROVED";
  unapprovedWordsFlagged: string[];
  createdAt: string;
};

type ApprovedWord = { id: string; englishWord: string; gaWord: string };

const defaultMetrics: VoiceMetrics = {
  totalAudioAssets: 0,
  aiGeneratedFiles: 0,
  approvedForEarlyLearning: 0,
  nativeVerified: 0,
  rejectedAudio: 0,
  approvedWords: 0,
  pendingAudioWords: 0,
  approvedAudioWords: 0,
  wordsMissingAudio: 0,
  needsNativeReview: 0,
  lessonsCount: 0,
  lessonAudioMissing: 0,
  studentRecordingsAwaitingReview: 0,
  songsPendingApproval: 0,
  reviewedAt: new Date(0).toISOString(),
};

const defaultReferenceForm = {
  referenceType: "YouTube",
  sourceUrl: "",
  sourceTitle: "",
  timestampStart: "",
  timestampEnd: "",
  linkedSound: "",
  linkedLetter: "",
  pronunciationNote: "",
  permissionStatus: "REFERENCE_ONLY",
  reviewStatus: "DRAFT",
};

const defaultSongForm = {
  title: "",
  level: "Foundation",
  category: "Greetings",
  lyricsGa: "",
  lyricsEnglish: "",
  sourceType: "AI_GENERATED_SONG",
};

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </article>
  );
}

export default function AdminGaVoicePage() {
  const [metrics, setMetrics] = useState<VoiceMetrics>(defaultMetrics);
  const [references, setReferences] = useState<ReferenceRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [approvedWords, setApprovedWords] = useState<ApprovedWord[]>([]);
  const [selectedSongWordIds, setSelectedSongWordIds] = useState<string[]>([]);
  const [referenceForm, setReferenceForm] = useState(defaultReferenceForm);
  const [songForm, setSongForm] = useState(defaultSongForm);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const completionPercent = useMemo(() => {
    if (metrics.approvedWords <= 0) return 0;
    return Math.round((metrics.approvedAudioWords / metrics.approvedWords) * 100);
  }, [metrics.approvedWords, metrics.approvedAudioWords]);

  const loadAll = useCallback(async () => {
    const [
      metricsResponse,
      referenceResponse,
      recordingResponse,
      songResponse,
      approvedWordsResponse,
    ] = await Promise.all([
      fetch("/api/admin/ga/audio", { cache: "no-store" }),
      fetch("/api/admin/ga/audio/reference", { cache: "no-store" }),
      fetch("/api/admin/ga/student-recordings?limit=100", { cache: "no-store" }),
      fetch("/api/admin/ga/songs", { cache: "no-store" }),
      fetch("/api/admin/ga/words?reviewStatus=Approved&limit=250", { cache: "no-store" }),
    ]);

    const allResponses = [metricsResponse, referenceResponse, recordingResponse, songResponse, approvedWordsResponse];
    if (allResponses.some((response) => response.status === 401)) {
      window.location.replace("/admin/login?next=/admin/ga-voice");
      return;
    }

    const metricsPayload = await metricsResponse.json().catch(() => null) as { item?: VoiceMetrics; error?: string } | null;
    if (!metricsResponse.ok) {
      setMessage(metricsPayload?.error ?? "Unable to load Ga voice metrics.");
      return;
    }

    const referencePayload = await referenceResponse.json().catch(() => null) as { items?: ReferenceRow[] } | null;
    const recordingPayload = await recordingResponse.json().catch(() => null) as { items?: RecordingRow[] } | null;
    const songPayload = await songResponse.json().catch(() => null) as { items?: SongRow[] } | null;
    const approvedWordsPayload = await approvedWordsResponse.json().catch(() => null) as { items?: ApprovedWord[] } | null;

    setMetrics(metricsPayload?.item ?? defaultMetrics);
    setReferences(referencePayload?.items ?? []);
    setRecordings(recordingPayload?.items ?? []);
    setSongs(songPayload?.items ?? []);
    setApprovedWords(approvedWordsPayload?.items ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  async function saveReference() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/audio/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(referenceForm),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to create pronunciation reference.");
        return;
      }
      setMessage("Pronunciation reference saved.");
      setReferenceForm(defaultReferenceForm);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function saveSong() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/songs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...songForm, wordIdsUsed: selectedSongWordIds }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to create song draft.");
        return;
      }
      setMessage("Song draft saved.");
      setSongForm(defaultSongForm);
      setSelectedSongWordIds([]);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function approveSong(songId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/songs/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to approve song.");
        return;
      }
      setMessage("Song approved for early learning.");
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function rejectSong(songId: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/songs/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId, notes: "Needs correction before student use." }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to reject song.");
        return;
      }
      setMessage("Song rejected.");
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function reviewRecording(recordingId: string, reviewStatus: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/ga/student-recordings/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId, reviewStatus }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to review recording.");
        return;
      }
      setMessage("Student recording reviewed.");
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  function toggleSongWord(wordId: string) {
    setSelectedSongWordIds((current) => current.includes(wordId) ? current.filter((id) => id !== wordId) : [...current, wordId]);
  }

  return (
    <div className="space-y-6 pb-24">
      <section className="rounded-3xl border border-slate-800/80 bg-linear-to-br from-cyan-500/15 via-slate-950 to-emerald-500/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Ga Learning Hub</p>
        <h1 className="mt-2 text-3xl font-black text-white">Ga Voice Dashboard</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          Voice sits on top of the verified Ga word bank. Student voice experience is unlocked only when words are approved and audio is reviewed.
        </p>
        <p className="mt-3 text-xs text-slate-400">Coverage: {completionPercent}% of approved words currently have approved audio-ready status.</p>
      </section>

      {message ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Approved Ga words" value={metrics.approvedWords} hint="Only these can enter voice lessons." />
        <MetricCard label="Audio approved" value={metrics.approvedAudioWords} hint="Student-safe voice inventory." />
        <MetricCard label="Needs recording" value={metrics.pendingAudioWords} hint="Approved words still missing voice." />
        <MetricCard label="Needs native review" value={metrics.needsNativeReview} hint="Usable now, future speaker review later." />
      </section>

      <AdminSectionCard title="Pronunciation References" eyebrow="Reference only, no cloning">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold uppercase text-slate-400">Reference type<input value={referenceForm.referenceType} onChange={(event) => setReferenceForm((form) => ({ ...form, referenceType: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Source URL<input value={referenceForm.sourceUrl} onChange={(event) => setReferenceForm((form) => ({ ...form, sourceUrl: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Source title<input value={referenceForm.sourceTitle} onChange={(event) => setReferenceForm((form) => ({ ...form, sourceTitle: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Timestamp start<input value={referenceForm.timestampStart} onChange={(event) => setReferenceForm((form) => ({ ...form, timestampStart: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Timestamp end<input value={referenceForm.timestampEnd} onChange={(event) => setReferenceForm((form) => ({ ...form, timestampEnd: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Linked sound<input value={referenceForm.linkedSound} onChange={(event) => setReferenceForm((form) => ({ ...form, linkedSound: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="md:col-span-3 text-xs font-bold uppercase text-slate-400">Pronunciation note<textarea value={referenceForm.pronunciationNote} onChange={(event) => setReferenceForm((form) => ({ ...form, pronunciationNote: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={saveReference} disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Save reference</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-180 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Type</th><th className="px-2 py-2">Sound/Letter</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Link</th></tr></thead>
            <tbody>
              {references.map((reference) => (
                <tr key={reference.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-2">{reference.referenceType}</td>
                  <td className="px-2 py-2">{reference.linkedSound ?? reference.linkedLetter ?? "-"}</td>
                  <td className="px-2 py-2">{reference.reviewStatus}</td>
                  <td className="px-2 py-2"><a href={reference.sourceUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Song Manager" eyebrow="Draft, check words, approve">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold uppercase text-slate-400">Song title<input value={songForm.title} onChange={(event) => setSongForm((form) => ({ ...form, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold uppercase text-slate-400">Level<select value={songForm.level} onChange={(event) => setSongForm((form) => ({ ...form, level: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{GA_LEVELS.map((level) => <option key={level}>{level}</option>)}</select></label>
          <label className="text-xs font-bold uppercase text-slate-400">Category<select value={songForm.category} onChange={(event) => setSongForm((form) => ({ ...form, category: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{GA_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="md:col-span-3 text-xs font-bold uppercase text-slate-400">Ga lyrics<textarea value={songForm.lyricsGa} onChange={(event) => setSongForm((form) => ({ ...form, lyricsGa: event.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
          <label className="md:col-span-3 text-xs font-bold uppercase text-slate-400">English meaning<textarea value={songForm.lyricsEnglish} onChange={(event) => setSongForm((form) => ({ ...form, lyricsEnglish: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase text-slate-400">Link approved words used by song</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {approvedWords.map((word) => (
              <label key={word.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
                <input type="checkbox" checked={selectedSongWordIds.includes(word.id)} onChange={() => toggleSongWord(word.id)} />
                <span><b>{word.englishWord}</b> · {word.gaWord}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={saveSong} disabled={saving} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Save song draft</button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-220 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Song</th><th className="px-2 py-2">Level</th><th className="px-2 py-2">Review</th><th className="px-2 py-2">Audio readiness</th><th className="px-2 py-2">Flagged words</th><th className="px-2 py-2">Action</th></tr></thead>
            <tbody>
              {songs.map((song) => (
                <tr key={song.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-2 font-bold text-white">{song.title}</td>
                  <td className="px-2 py-2">{song.level}</td>
                  <td className="px-2 py-2">{song.reviewStatus}</td>
                  <td className="px-2 py-2">{song.audioReadiness}</td>
                  <td className="px-2 py-2">{song.unapprovedWordsFlagged.length}</td>
                  <td className="px-2 py-2 space-x-2">
                    <button type="button" onClick={() => void approveSong(song.id)} disabled={saving || song.audioReadiness !== "READY_FOR_APPROVAL"} className="rounded-lg border border-emerald-600 px-3 py-1 font-bold text-emerald-200 disabled:opacity-50">Approve</button>
                    <button type="button" onClick={() => void rejectSong(song.id)} disabled={saving} className="rounded-lg border border-rose-600 px-3 py-1 font-bold text-rose-200 disabled:opacity-50">Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Student Recording Review" eyebrow="Supportive feedback only">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left text-xs">
            <thead className="uppercase text-slate-500"><tr><th className="px-2 py-2">Student</th><th className="px-2 py-2">Target</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Feedback</th><th className="px-2 py-2">Action</th></tr></thead>
            <tbody>
              {recordings.map((recording) => (
                <tr key={recording.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-2 py-2 font-bold text-white">{recording.student.name}</td>
                  <td className="px-2 py-2">{recording.word ? `${recording.word.englishWord} · ${recording.word.gaWord}` : recording.lesson?.title ?? "Sound drill"}</td>
                  <td className="px-2 py-2">{recording.reviewStatus}</td>
                  <td className="px-2 py-2">{recording.adminFeedback ?? "-"}</td>
                  <td className="px-2 py-2 space-x-2">
                    <button type="button" onClick={() => void reviewRecording(recording.id, "REVIEWED")} disabled={saving} className="rounded-lg border border-emerald-600 px-3 py-1 font-bold text-emerald-200 disabled:opacity-50">Mark reviewed</button>
                    <button type="button" onClick={() => void reviewRecording(recording.id, "NEEDS_REPEAT")} disabled={saving} className="rounded-lg border border-amber-600 px-3 py-1 font-bold text-amber-200 disabled:opacity-50">Needs repeat</button>
                    <button type="button" onClick={() => void reviewRecording(recording.id, "FLAGGED")} disabled={saving} className="rounded-lg border border-rose-600 px-3 py-1 font-bold text-rose-200 disabled:opacity-50">Flag</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
