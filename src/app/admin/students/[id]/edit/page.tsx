"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import {
  CURRICULUM_PATHWAYS,
  EXAM_BOARDS,
  GCSE_EXAM_BOARD_WARNING,
  KEY_STAGES,
  YEAR_GROUPS,
  curriculumPathwayForYearGroup,
  isGcseYearGroup,
  keyStageForYearGroup,
} from "@/lib/curriculum";
import { uploadMediaFile } from "@/lib/upload-client";

type ParentOption = { id: string; name: string | null; email: string };
type StudentDetail = {
  id: string;
  name: string;
  age: number | null;
  yearGroup: string | null;
  avatar: string | null;
  level: number;
  selectedVoice: string;
  studentProfile: {
    dateOfBirth: string | null;
    keyStageLevel: string | null;
    learningLevel: string | null;
    senSupportNeeds: string | null;
    readingLevel: string | null;
    weakAreasText: string | null;
    voiceProfile: string | null;
    aiLearningProfileJson: string | null;
    curriculumPathway?: string | null;
    examBoard?: string | null;
    gcseSubjects?: string[];
    targetGrades?: Record<string, string>;
    guardianPermissions: string | null;
    schoolInformation: string | null;
    subjectFocus: string | null;
  } | null;
  parent: ParentOption;
};

type SubjectLevelOverride = {
  level: number;
  appliedAt: string;
  appliedBy: string;
  confidence?: number;
  reasons?: string[];
};

function parseSubjectLevelOverrides(raw: string): Record<string, SubjectLevelOverride> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const profile = parsed as Record<string, unknown>;
    const value = profile.adminSubjectLevelOverrides;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    const out: Record<string, SubjectLevelOverride> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!key.trim()) continue;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const level = typeof row.level === "number" && Number.isFinite(row.level) ? Math.round(row.level) : null;
      const appliedAt = typeof row.appliedAt === "string" && row.appliedAt.trim() ? row.appliedAt : null;
      const appliedBy = typeof row.appliedBy === "string" && row.appliedBy.trim() ? row.appliedBy : null;
      if (!level || !appliedAt || !appliedBy) continue;
      out[key.trim().toLowerCase()] = {
        level,
        appliedAt,
        appliedBy,
        confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? Math.round(row.confidence) : undefined,
        reasons: Array.isArray(row.reasons) ? row.reasons.filter((item): item is string => typeof item === "string") : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export default function EditStudentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [avatar, setAvatar] = useState("");
  const [level, setLevel] = useState("1");
  const [selectedVoice, setSelectedVoice] = useState("friendly_coach");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [keyStageLevel, setKeyStageLevel] = useState("");
  const [learningLevel, setLearningLevel] = useState("");
  const [senSupportNeeds, setSenSupportNeeds] = useState("");
  const [readingLevel, setReadingLevel] = useState("");
  const [weakAreasText, setWeakAreasText] = useState("");
  const [voiceProfile, setVoiceProfile] = useState("friendly_coach");
  const [aiLearningProfileJson, setAiLearningProfileJson] = useState("");
  const [guardianPermissions, setGuardianPermissions] = useState("");
  const [schoolInformation, setSchoolInformation] = useState("");
  const [subjectFocus, setSubjectFocus] = useState("");
  const [curriculumPathway, setCurriculumPathway] = useState<"primary" | "ks3" | "gcse">("primary");
  const [examBoard, setExamBoard] = useState("");
  const [gcseSubjects, setGcseSubjects] = useState("");
  const [targetGrades, setTargetGrades] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const subjectLevelOverrides = parseSubjectLevelOverrides(aiLearningProfileJson);

  useEffect(() => {
    fetch("/api/admin/parents")
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => { if (payload) setParents(payload.parents ?? []); });
    fetch(`/api/admin/students/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        if (!payload) return;
        if (payload.student) {
          setStudent(payload.student);
          setName(payload.student.name);
          setParentId(payload.student.parent.id);
          setAge(payload.student.age ? String(payload.student.age) : "");
          setYearGroup(payload.student.yearGroup ?? "");
          setAvatar(payload.student.avatar ?? "");
          setLevel(String(payload.student.level ?? 1));
          setSelectedVoice(payload.student.selectedVoice ?? "friendly_coach");
          setDateOfBirth(payload.student.studentProfile?.dateOfBirth ? payload.student.studentProfile.dateOfBirth.slice(0, 10) : "");
          setKeyStageLevel(payload.student.studentProfile?.keyStageLevel ?? "");
          setLearningLevel(payload.student.studentProfile?.learningLevel ?? "");
          setSenSupportNeeds(payload.student.studentProfile?.senSupportNeeds ?? "");
          setReadingLevel(payload.student.studentProfile?.readingLevel ?? "");
          setWeakAreasText(payload.student.studentProfile?.weakAreasText ?? "");
          setVoiceProfile(payload.student.studentProfile?.voiceProfile ?? payload.student.selectedVoice ?? "friendly_coach");
          setAiLearningProfileJson(payload.student.studentProfile?.aiLearningProfileJson ?? "");
          setCurriculumPathway((payload.student.studentProfile?.curriculumPathway as "primary" | "ks3" | "gcse") ?? curriculumPathwayForYearGroup(payload.student.yearGroup));
          setExamBoard(payload.student.studentProfile?.examBoard ?? "");
          setGcseSubjects((payload.student.studentProfile?.gcseSubjects ?? []).join(", "));
          setTargetGrades(JSON.stringify(payload.student.studentProfile?.targetGrades ?? {}, null, 2));
          setGuardianPermissions(payload.student.studentProfile?.guardianPermissions ?? "");
          setSchoolInformation(payload.student.studentProfile?.schoolInformation ?? "");
          setSubjectFocus(payload.student.studentProfile?.subjectFocus ?? "");
        }
      });
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    let parsedTargetGrades: Record<string, string> = {};
    try {
      const parsed = JSON.parse(targetGrades || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedTargetGrades = parsed as Record<string, string>;
      } else {
        setError("Target grades must be a JSON object.");
        return;
      }
    } catch {
      setError("Target grades must be valid JSON.");
      return;
    }
    const response = await fetch(`/api/admin/students/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId,
        name,
        age: age ? Number(age) : null,
        yearGroup: yearGroup || null,
        avatar: avatar || null,
        level: Number(level),
        selectedVoice: selectedVoice || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null,
        keyStageLevel: keyStageLevel || null,
        learningLevel: learningLevel || null,
        senSupportNeeds: senSupportNeeds || null,
        readingLevel: readingLevel || null,
        weakAreasText: weakAreasText || null,
        voiceProfile: voiceProfile || null,
        aiLearningProfileJson: aiLearningProfileJson || null,
        curriculumPathway,
        examBoard: examBoard || null,
        gcseSubjects: gcseSubjects.split(",").map((entry) => entry.trim()).filter(Boolean),
        targetGrades: parsedTargetGrades,
        guardianPermissions: guardianPermissions || null,
        schoolInformation: schoolInformation || null,
        subjectFocus: subjectFocus || null,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to update student.");
      return;
    }
    router.replace(`/admin/students/${params.id}`);
  }

  async function handleAvatarUpload(file: File | null) {
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    try {
      const uploaded = await uploadMediaFile(file, "avatars");
      setAvatar(uploaded.publicUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Avatar upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }

  if (!student) {
    return <AdminSectionCard title="Edit Student"><p className="text-sm text-slate-400">Loading student...</p></AdminSectionCard>;
  }

  return (
    <AdminSectionCard title="Edit Student" eyebrow="Learners">
      <form onSubmit={submit} className="max-w-3xl space-y-4">
        <label className="block text-sm font-bold text-slate-300">
          Linked parent
          <select value={parentId} onChange={(event) => setParentId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>{parent.name ?? parent.email} ({parent.email})</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Student name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Age
          <input type="number" min={1} max={18} value={age} onChange={(event) => setAge(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Year group
          <select
            value={yearGroup}
            onChange={(event) => {
              const nextYear = event.target.value;
              setYearGroup(nextYear);
              setKeyStageLevel(nextYear ? keyStageForYearGroup(nextYear) : keyStageLevel);
              const nextPathway = curriculumPathwayForYearGroup(nextYear);
              setCurriculumPathway(nextPathway);
              if (!isGcseYearGroup(nextYear)) {
                setExamBoard("");
              }
            }}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white"
          >
            <option value="">Select year group</option>
            {YEAR_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Date of birth
            <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Avatar URL
            <span className="mt-1 block text-xs font-medium text-amber-200">
              Use approved non-identifying avatar images only. Do not upload child face photos, school uniform images, names, or school identifiers.
            </span>
            <input value={avatar} onChange={(event) => setAvatar(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
            <p className="mt-1 text-xs text-slate-500">External URLs should also point only to approved non-identifying avatar images.</p>
            <input
              type="file"
              accept="image/*"
              disabled={avatarUploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleAvatarUpload(file);
                event.currentTarget.value = "";
              }}
              className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-2 file:font-bold file:text-white"
            />
            <p className="mt-1 text-xs text-slate-500">{avatarUploading ? "Uploading avatar..." : "Upload an image to generate the avatar URL automatically."}</p>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-bold text-slate-300">
            Level
            <input type="number" min={1} max={10} value={level} onChange={(event) => setLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Voice profile
            <input value={voiceProfile} onChange={(event) => setVoiceProfile(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Selected voice
            <input value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            KS level
            <select value={keyStageLevel} onChange={(event) => setKeyStageLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              <option value="">Select key stage</option>
              {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Learning level
            <input value={learningLevel} onChange={(event) => setLearningLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Curriculum pathway
            <select value={curriculumPathway} onChange={(event) => setCurriculumPathway(event.target.value as "primary" | "ks3" | "gcse")} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              {CURRICULUM_PATHWAYS.map((pathway) => <option key={pathway} value={pathway}>{pathway.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Exam board {isGcseYearGroup(yearGroup) ? "(recommended)" : "(not needed for this year)"}
            <select value={examBoard} onChange={(event) => setExamBoard(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" disabled={!isGcseYearGroup(yearGroup)}>
              <option value="">None</option>
              {EXAM_BOARDS.map((board) => <option key={board} value={board}>{board}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Reading level
            <input value={readingLevel} onChange={(event) => setReadingLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Subject focus
            <input value={subjectFocus} onChange={(event) => setSubjectFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <label className="block text-sm font-bold text-slate-300">
          SEN / support needs
          <textarea value={senSupportNeeds} onChange={(event) => setSenSupportNeeds(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Weak areas
          <textarea value={weakAreasText} onChange={(event) => setWeakAreasText(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          GCSE subjects (comma separated)
          <input value={gcseSubjects} onChange={(event) => setGcseSubjects(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Target grades (JSON)
          <textarea value={targetGrades} onChange={(event) => setTargetGrades(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        {isGcseYearGroup(yearGroup) && !examBoard ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{GCSE_EXAM_BOARD_WARNING}</p>
        ) : null}
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Applied Subject Level Overrides</p>
            <Link
              href={`/admin/students/${params.id}`}
              className="rounded-lg border border-cyan-300/40 bg-cyan-200/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-cyan-100 hover:bg-cyan-200/20"
            >
              Open recommendations
            </Link>
          </div>
          <p className="mt-1 text-[11px] text-cyan-100/90">Apply or revert subject overrides from the student detail recommendations panel.</p>
          {Object.keys(subjectLevelOverrides).length === 0 ? (
            <p className="mt-2 text-xs text-slate-300">No overrides applied yet.</p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {Object.entries(subjectLevelOverrides).map(([scopedSubject, row]) => (
                <div key={scopedSubject} className="rounded-lg border border-cyan-400/20 bg-slate-900/50 p-2 text-xs text-slate-100">
                  <p className="font-bold uppercase tracking-wide text-cyan-100">{scopedSubject}</p>
                  <p className="mt-1">Level: {row.level}</p>
                  <p>Applied: {new Date(row.appliedAt).toLocaleString()}</p>
                  <p className="truncate">By: {row.appliedBy}</p>
                  {typeof row.confidence === "number" ? <p>Confidence: {row.confidence}%</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <label className="block text-sm font-bold text-slate-300">
          AI learning profile (JSON)
          <textarea value={aiLearningProfileJson} onChange={(event) => setAiLearningProfileJson(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Guardian permissions
          <input value={guardianPermissions} onChange={(event) => setGuardianPermissions(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          School information
          <input value={schoolInformation} onChange={(event) => setSchoolInformation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Save Student</button>
      </form>
    </AdminSectionCard>
  );
}
