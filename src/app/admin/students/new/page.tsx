"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";
import { KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup } from "@/lib/curriculum";

type ParentOption = { id: string; name: string | null; email: string };

const voiceProfiles = [
  { id: "friendly_coach", label: "Friendly Coach" },
  { id: "encouraging_mentor", label: "Encouraging Mentor" },
  { id: "dynamic_motivator", label: "Dynamic Motivator" },
  { id: "calm_guide", label: "Calm Guide" },
];

const learningLevels = [
  { value: 1, label: "Beginner (Level 1)" },
  { value: 2, label: "Level 2" },
  { value: 3, label: "Level 3" },
  { value: 4, label: "Level 4" },
  { value: 5, label: "Level 5" },
  { value: 6, label: "Level 6" },
  { value: 7, label: "Level 7" },
  { value: 8, label: "Level 8" },
  { value: 9, label: "Level 9" },
  { value: 10, label: "Advanced (Level 10)" },
];

export default function NewStudentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [parentId, setParentId] = useState(searchParams.get("parentId") ?? "");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [avatar, setAvatar] = useState("");
  const [keyStageLevel, setKeyStageLevel] = useState("");
  const [learningLevel, setLearningLevel] = useState("");
  const [senSupportNeeds, setSenSupportNeeds] = useState("");
  const [readingLevel, setReadingLevel] = useState("");
  const [weakAreasText, setWeakAreasText] = useState("");
  const [aiLearningProfileJson, setAiLearningProfileJson] = useState("");
  const [guardianPermissions, setGuardianPermissions] = useState("");
  const [schoolInformation, setSchoolInformation] = useState("");
  const [subjectFocus, setSubjectFocus] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("friendly_coach");
  const [level, setLevel] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/parents")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload) setParents(payload.parents ?? []);
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!parentId || !name.trim()) {
      setError("Parent and student name are required");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          name,
          age: age ? Number(age) : undefined,
          yearGroup: yearGroup || undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : undefined,
          avatar: avatar || undefined,
          keyStageLevel: keyStageLevel || undefined,
          learningLevel: learningLevel || undefined,
          senSupportNeeds: senSupportNeeds || undefined,
          readingLevel: readingLevel || undefined,
          weakAreasText: weakAreasText || undefined,
          aiLearningProfileJson: aiLearningProfileJson || undefined,
          guardianPermissions: guardianPermissions || undefined,
          schoolInformation: schoolInformation || undefined,
          subjectFocus: subjectFocus || undefined,
          voiceProfile: selectedVoice,
          selectedVoice,
          level: Number(level),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to create student.");
        return;
      }
      router.replace(`/admin/students/${payload.student.id}`);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminSectionCard title="Add Student" eyebrow="Learners">
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {/* Linking */}
        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Parent Assignment
          </legend>

          <label className="block text-sm font-bold text-slate-300">
            Linked Parent *
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select a parent account</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name ?? parent.email} ({parent.email})
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {/* Student Information */}
        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Student Information
          </legend>

          <label className="block text-sm font-bold text-slate-300">
            Student Name *
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="John Smith"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Age
              <input
                type="number"
                min={1}
                max={18}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                placeholder="8"
              />
            </label>

            <label className="block text-sm font-bold text-slate-300">
              Year Group
              <select
                value={yearGroup}
                onChange={(event) => {
                  const nextYear = event.target.value;
                  setYearGroup(nextYear);
                  setKeyStageLevel(nextYear ? keyStageForYearGroup(nextYear) : "");
                }}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select year group</option>
                {YEAR_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Date of Birth
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Avatar URL
              <input
                value={avatar}
                onChange={(event) => setAvatar(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                placeholder="https://..."
              />
            </label>
          </div>
        </fieldset>

        {/* Learning Profile */}
        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Learning Profile
          </legend>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Voice Profile
              <select
                value={selectedVoice}
                onChange={(event) => setSelectedVoice(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                {voiceProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold text-slate-300">
              Starting Learning Level
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                {learningLevels.map((lvl) => (
                  <option key={lvl.value} value={lvl.value}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              KS Level
              <select value={keyStageLevel} onChange={(event) => setKeyStageLevel(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                <option value="">Select key stage</option>
                {KEY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Learning Level Label
              <input value={learningLevel} onChange={(event) => setLearningLevel(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Reading Level
              <input value={readingLevel} onChange={(event) => setReadingLevel(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Subject Focus
              <input value={subjectFocus} onChange={(event) => setSubjectFocus(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            SEN Support Needs
            <textarea value={senSupportNeeds} onChange={(event) => setSenSupportNeeds(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Weak Areas
            <textarea value={weakAreasText} onChange={(event) => setWeakAreasText(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            AI Learning Profile (JSON)
            <textarea value={aiLearningProfileJson} onChange={(event) => setAiLearningProfileJson(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Guardian Permissions
            <input value={guardianPermissions} onChange={(event) => setGuardianPermissions(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="pickup, media-consent, homework" />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            School Information
            <input value={schoolInformation} onChange={(event) => setSchoolInformation(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" placeholder="School name / class / teacher" />
          </label>
        </fieldset>

        {/* Error Message */}
        {error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-indigo-500 px-6 py-2 font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Student"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-700 px-6 py-2 font-bold text-slate-300 hover:bg-slate-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </AdminSectionCard>
  );
}

