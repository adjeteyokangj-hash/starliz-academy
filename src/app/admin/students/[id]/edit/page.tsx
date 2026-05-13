"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup } from "@/lib/curriculum";

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
    guardianPermissions: string | null;
    schoolInformation: string | null;
    subjectFocus: string | null;
  } | null;
  parent: ParentOption;
};

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
  const [error, setError] = useState<string | null>(null);

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
          setGuardianPermissions(payload.student.studentProfile?.guardianPermissions ?? "");
          setSchoolInformation(payload.student.studentProfile?.schoolInformation ?? "");
          setSubjectFocus(payload.student.studentProfile?.subjectFocus ?? "");
        }
      });
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
            <input value={avatar} onChange={(event) => setAvatar(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
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

