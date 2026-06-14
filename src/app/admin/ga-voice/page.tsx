"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GaHubAccordionSection from "@/components/admin/GaHubAccordionSection";
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

type RecordingTargetMode = "word" | "letter";

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
  const [recordingTargetMode, setRecordingTargetMode] = useState<RecordingTargetMode>("word");
  const [recordingWordId, setRecordingWordId] = useState<string>("");
  const [recordingLetter, setRecordingLetter] = useState<string>("A");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string>("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [audioLevel, setAudioLevel] = useState(0);
  const [studioSaving, setStudioSaving] = useState(false);
  const [studioEnhancementMessage, setStudioEnhancementMessage] = useState<string | null>(null);
  const [selectedSongWordIds, setSelectedSongWordIds] = useState<string[]>([]);
  const [referenceForm, setReferenceForm] = useState(defaultReferenceForm);
  const [songForm, setSongForm] = useState(defaultSongForm);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const completionPercent = useMemo(() => {
    if (metrics.approvedWords <= 0) return 0;
    return Math.round((metrics.approvedAudioWords / metrics.approvedWords) * 100);
  }, [metrics.approvedWords, metrics.approvedAudioWords]);
  const selectedRecordingWord = useMemo(
    () => approvedWords.find((word) => word.id === recordingWordId) ?? null,
    [approvedWords, recordingWordId],
  );
  const levelPercent = Math.max(0, Math.min(100, Math.round(audioLevel * 100)));
  const levelWarning = levelPercent < 12 ? "Too quiet" : levelPercent > 85 ? "Too loud" : "Good level";
  const levelWidthClass = levelPercent >= 100 ? "w-full"
    : levelPercent >= 95 ? "w-[95%]"
    : levelPercent >= 90 ? "w-[90%]"
    : levelPercent >= 85 ? "w-[85%]"
    : levelPercent >= 80 ? "w-4/5"
    : levelPercent >= 75 ? "w-3/4"
    : levelPercent >= 70 ? "w-[70%]"
    : levelPercent >= 65 ? "w-[65%]"
    : levelPercent >= 60 ? "w-3/5"
    : levelPercent >= 55 ? "w-[55%]"
    : levelPercent >= 50 ? "w-1/2"
    : levelPercent >= 45 ? "w-[45%]"
    : levelPercent >= 40 ? "w-2/5"
    : levelPercent >= 35 ? "w-[35%]"
    : levelPercent >= 30 ? "w-[30%]"
    : levelPercent >= 25 ? "w-1/4"
    : levelPercent >= 20 ? "w-1/5"
    : levelPercent >= 15 ? "w-[15%]"
    : levelPercent >= 10 ? "w-[10%]"
    : "w-[4%]";

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
    const nextApprovedWords = approvedWordsPayload?.items ?? [];
    setApprovedWords(nextApprovedWords);
    setRecordingWordId((current) => {
      if (current && nextApprovedWords.some((word) => word.id === current)) return current;
      return nextApprovedWords[0]?.id ?? "";
    });
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

  const clearStudioAudio = useCallback(() => {
    setRecordingBlob(null);
    setRecordingSeconds(0);
    setAudioLevel(0);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl("");
  }, [recordingUrl]);

  const stopLevelMonitor = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const stopRecorder = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopLevelMonitor();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) track.stop();
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
  }, [stopLevelMonitor]);

  async function startRecording() {
    if (isRecording) return;
    setStudioEnhancementMessage(null);
    clearStudioAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordingBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordingUrl(url);
        chunksRef.current = [];
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const sample = new Uint8Array(analyser.fftSize);
      const monitor = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(sample);
        let sumSquares = 0;
        for (let index = 0; index < sample.length; index += 1) {
          const centered = (sample[index] - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / sample.length);
        setAudioLevel(rms * 2.5);
        animationFrameRef.current = requestAnimationFrame(monitor);
      };

      recorder.start(250);
      setRecordingSeconds(0);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => setRecordingSeconds((current) => current + 1), 1000);
      animationFrameRef.current = requestAnimationFrame(monitor);
    } catch {
      setMicPermission("denied");
      setMessage("Microphone access denied. Allow microphone permission and try again.");
      stopRecorder();
    }
  }

  function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function saveStudioRecording() {
    if (!recordingBlob) {
      setMessage("Record or upload audio before saving.");
      return;
    }
    if (recordingTargetMode === "word" && !recordingWordId) {
      setMessage("Choose an approved word target before saving.");
      return;
    }

    setStudioSaving(true);
    try {
      const extension = recordingBlob.type.includes("ogg") ? "ogg" : recordingBlob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([recordingBlob], `ga-voice-${Date.now()}.${extension}`, { type: recordingBlob.type || "audio/webm" });

      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("folder", "audio");

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploadPayload = await uploadResponse.json().catch(() => null) as { publicUrl?: string; objectKey?: string; error?: string } | null;
      if (!uploadResponse.ok || !uploadPayload?.publicUrl) {
        setMessage(uploadPayload?.error ?? "Unable to upload recording.");
        return;
      }

      const saveResponse = await fetch("/api/admin/ga/audio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wordId: recordingTargetMode === "word" ? recordingWordId : null,
          letterKey: recordingTargetMode === "letter" ? recordingLetter : null,
          audioUrl: uploadPayload.publicUrl,
          audioStorageKey: uploadPayload.objectKey ?? null,
          sourceType: "ADMIN_UPLOADED",
          reviewStatus: "AI_GENERATED",
          approvalStatus: "PENDING",
          pronunciationNote: recordingTargetMode === "word"
            ? `Recording target: ${selectedRecordingWord?.englishWord ?? "word"} / ${selectedRecordingWord?.gaWord ?? ""}`
            : `Recording target letter: ${recordingLetter}`,
          adminNotes: "Enhancement not applied yet - original recording saved.",
        }),
      });
      const savePayload = await saveResponse.json().catch(() => null) as { error?: string } | null;
      if (!saveResponse.ok) {
        setMessage(savePayload?.error ?? "Unable to save recording to Ga audio assets.");
        return;
      }

      setMessage("Recording uploaded and linked to selected target.");
      clearStudioAudio();
      await loadAll();
    } finally {
      setStudioSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      stopRecorder();
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl, stopRecorder]);

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

      <GaHubAccordionSection title="Ga Voice Recording Studio" eyebrow="Record, review, and save to selected target" defaultOpen={true}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold uppercase text-slate-400">Target type
            <select
              value={recordingTargetMode}
              onChange={(event) => setRecordingTargetMode(event.target.value as RecordingTargetMode)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="word">Approved word</option>
              <option value="letter">Letter drill</option>
            </select>
          </label>
          {recordingTargetMode === "word" ? (
            <label className="text-xs font-bold uppercase text-slate-400">Word target
              <select
                value={recordingWordId}
                onChange={(event) => setRecordingWordId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {approvedWords.map((word) => (
                  <option key={word.id} value={word.id}>{word.englishWord} · {word.gaWord}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs font-bold uppercase text-slate-400">Letter target
              <select
                value={recordingLetter}
                onChange={(event) => setRecordingLetter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {["A", "B", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P", "R", "S", "T", "U", "W", "Y"].map((letter) => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </label>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
            <p className="font-black uppercase text-slate-400">Mic status</p>
            <p className="mt-1">Permission: {micPermission}</p>
            <p>Timer: {formatDuration(recordingSeconds)}</p>
            <p>Level: {levelWarning}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase text-slate-400">Input level meter</p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-900">
            <div className={`h-full transition-all ${levelWidthClass} ${levelPercent < 12 ? "bg-amber-500" : levelPercent > 85 ? "bg-rose-500" : "bg-emerald-500"}`} />
          </div>
          <p className="mt-2 text-xs text-slate-400">{levelWarning === "Too quiet" ? "Input is quiet. Move closer to the mic." : levelWarning === "Too loud" ? "Input may clip. Lower your voice or move back." : "Input level looks healthy."}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!isRecording ? (
            <button type="button" onClick={() => void startRecording()} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white">Start recording</button>
          ) : (
            <button type="button" onClick={stopRecorder} className="rounded-xl border border-rose-600 px-4 py-2 text-sm font-black text-rose-200">Stop recording</button>
          )}
          <label className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-100">
            Upload audio file
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setRecordingBlob(file);
                if (recordingUrl) URL.revokeObjectURL(recordingUrl);
                setRecordingUrl(URL.createObjectURL(file));
                setRecordingSeconds(0);
                setStudioEnhancementMessage(null);
              }}
            />
          </label>
          <button type="button" onClick={clearStudioAudio} disabled={isRecording || (!recordingBlob && !recordingUrl)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-200 disabled:opacity-50">Re-record</button>
          <button type="button" onClick={() => setStudioEnhancementMessage("Enhancement not applied yet - original recording saved.")} className="rounded-xl border border-amber-600 px-4 py-2 text-sm font-black text-amber-100">Apply enhancement</button>
          <button type="button" onClick={() => void saveStudioRecording()} disabled={studioSaving || isRecording || !recordingBlob} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{studioSaving ? "Saving..." : "Save recording"}</button>
        </div>

        {recordingUrl ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-black uppercase text-slate-400">Playback</p>
            <audio controls src={recordingUrl} className="mt-2 w-full" />
          </div>
        ) : null}

        {studioEnhancementMessage ? (
          <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">{studioEnhancementMessage}</p>
        ) : null}
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title="Pronunciation References"
        eyebrow="Reference only, no cloning"
        defaultOpen={false}
        helperText="Collapsed by default. Expand to add or review pronunciation references."
      >
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
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title="Song Manager"
        eyebrow="Draft, check words, approve"
        defaultOpen={false}
        helperText="Collapsed by default. Expand to create, review, and approve Ga songs."
      >
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
      </GaHubAccordionSection>

      <GaHubAccordionSection
        title="Student Recording Review"
        eyebrow="Supportive feedback only"
        defaultOpen={false}
        helperText="Collapsed by default. Expand to review student recording submissions."
      >
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
      </GaHubAccordionSection>
    </div>
  );
}
