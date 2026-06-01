'use client';

import { useState, FormEvent, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { KEY_STAGES, YEAR_GROUPS, keyStageForYearGroup } from '@/lib/curriculum';

type ChildFormData = {
  name: string;
  dateOfBirth: string;
  schoolYear: string;
  yearGroup: string;
  keyStageLevel: string;
  subjectLevel: string;
  learningGoals: string;
  supportNeeds: string;
  selectedSubjects: string[];
  ageYears: number | '';
  startLevelChoice: 'Beginner' | 'Intermediate' | 'Confident';
  avatar: string;
};

type FieldErrors = Partial<Record<keyof ChildFormData, string>>;

type ChildManagementFormProps = {
  mode: 'add' | 'edit';
  initialData?: ChildFormData & { id: string; selectedSubjects?: string[] };
  onSuccess: () => void;
  onCancel: () => void;
};

type SubjectPolicy = {
  minSubjects: number;
  maxSubjects: number;
  requiredSubjectKeys: string[];
};

const SUBJECT_OPTIONS: Array<{ key: string; label: string; core: boolean }> = [
  { key: 'english', label: 'English', core: true },
  { key: 'maths', label: 'Maths', core: true },
  { key: 'science', label: 'Science', core: true },
  { key: 'history', label: 'History', core: false },
  { key: 'geography', label: 'Geography', core: false },
  { key: 'french', label: 'French', core: false },
  { key: 'spanish', label: 'Spanish', core: false },
  { key: 'german', label: 'German', core: false },
  { key: 'mandarin', label: 'Mandarin', core: false },
  { key: 'computing', label: 'Computing', core: false },
  { key: 'citizenship-pshe', label: 'Citizenship / PSHE', core: false },
  { key: 'pe-health', label: 'PE / Health Education', core: false },
  { key: 'gcse-practice', label: 'GCSE Practice', core: false },
];

const AVATAR_OPTIONS = [
  { value: 'star',    emoji: '⭐', label: 'Star' },
  { value: 'rocket',  emoji: '🚀', label: 'Rocket' },
  { value: 'owl',     emoji: '🦉', label: 'Owl' },
  { value: 'lion',    emoji: '🦁', label: 'Lion' },
  { value: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { value: 'robot',   emoji: '🤖', label: 'Robot' },
  { value: 'book',    emoji: '📚', label: 'Book' },
  { value: 'rainbow', emoji: '🌈', label: 'Rainbow' },
  { value: 'dino',    emoji: '🦕', label: 'Dino' },
  { value: 'cat',     emoji: '🐱', label: 'Cat' },
  { value: 'dog',     emoji: '🐶', label: 'Dog' },
  { value: 'dragon',  emoji: '🐉', label: 'Dragon' },
];

function calcAgeFromDob(dob: string): number | '' {
  if (!dob) return '';
  const birthDate = new Date(dob);
  const today = new Date();
  if (isNaN(birthDate.getTime())) return '';
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age : '';
}

export function getChildFormValidationErrors(formData: ChildFormData, subjectPolicy: SubjectPolicy): FieldErrors {
  const nextErrors: FieldErrors = {};
  if (!formData.name.trim()) nextErrors.name = 'Child name is required.';
  if (formData.name.trim().length > 64) nextErrors.name = 'Child name must be 64 characters or fewer.';
  if (!formData.yearGroup.trim()) nextErrors.yearGroup = 'Please choose a year group.';
  if (!formData.keyStageLevel.trim()) nextErrors.keyStageLevel = 'Key stage is required.';
  if (!formData.subjectLevel.trim()) nextErrors.subjectLevel = 'Please choose a subject level.';
  if (!formData.ageYears) nextErrors.ageYears = 'Enter a date of birth to calculate age automatically.';
  if (typeof formData.ageYears === 'number' && (formData.ageYears < 3 || formData.ageYears > 18)) {
    nextErrors.ageYears = 'Calculated age must be between 3 and 18.';
  }
  if (formData.dateOfBirth) {
    const dob = new Date(formData.dateOfBirth);
    if (!isNaN(dob.getTime()) && dob > new Date()) {
      nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
    }
  }
  const goals = formData.learningGoals
    .split('\n')
    .map((goal) => goal.trim())
    .filter(Boolean);
  if (goals.length > 8) {
    nextErrors.learningGoals = 'Please provide no more than 8 learning goals.';
  }
  if (goals.some((goal) => goal.length > 120)) {
    nextErrors.learningGoals = 'Each learning goal must be 120 characters or fewer.';
  }
  if (formData.supportNeeds.trim().length > 500) {
    nextErrors.supportNeeds = 'Support needs must be 500 characters or fewer.';
  }
  if (formData.selectedSubjects.length < subjectPolicy.minSubjects) {
    nextErrors.subjectLevel = `Please select at least ${subjectPolicy.minSubjects} subjects.`;
  }
  if (formData.selectedSubjects.length > subjectPolicy.maxSubjects) {
    nextErrors.subjectLevel = `Please select up to ${subjectPolicy.maxSubjects} subjects.`;
  }
  for (const required of subjectPolicy.requiredSubjectKeys) {
    if (!formData.selectedSubjects.includes(required)) {
      nextErrors.subjectLevel = 'English and Maths are required.';
    }
  }
  return nextErrors;
}

export function getChildFormDisabledReason(formData: ChildFormData, subjectPolicy: SubjectPolicy): string | null {
  const validation = getChildFormValidationErrors(formData, subjectPolicy);
  return Object.values(validation)[0] ?? null;
}

export default function ChildManagementForm({ mode, initialData, onSuccess, onCancel }: ChildManagementFormProps) {
  const [formData, setFormData] = useState<ChildFormData>(() => {
    if (initialData) {
      const computedAge = initialData.dateOfBirth
        ? calcAgeFromDob(initialData.dateOfBirth)
        : initialData.ageYears;
      return { ...initialData, ageYears: computedAge, selectedSubjects: initialData.selectedSubjects ?? ['english', 'maths'] };
    }
    return {
      name: '',
      dateOfBirth: '',
      schoolYear: '',
      yearGroup: '',
      keyStageLevel: '',
      subjectLevel: '',
      learningGoals: '',
      supportNeeds: '',
      selectedSubjects: ['english', 'maths'],
      ageYears: '',
      startLevelChoice: 'Beginner',
      avatar: 'star',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [subjectPolicy, setSubjectPolicy] = useState<SubjectPolicy>({
    minSubjects: 2,
    maxSubjects: 4,
    requiredSubjectKeys: ['english', 'maths'],
  });

  const yearGroups = [...YEAR_GROUPS];
  const keyStages = [...KEY_STAGES];
  const subjectLevels = ['Foundation', 'Core', 'Developing', 'Secure', 'Greater Depth'];
  const expectedKeyStage = formData.yearGroup ? keyStageForYearGroup(formData.yearGroup) : null;
  const keyStageMismatch = Boolean(expectedKeyStage && formData.keyStageLevel && expectedKeyStage !== formData.keyStageLevel);

  useEffect(() => {
    let cancelled = false;
    async function loadPolicy() {
      const response = await fetch('/api/parent/subject-selection-policy', { credentials: 'include' });
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as { policy?: SubjectPolicy };
      if (!payload.policy) return;
      setSubjectPolicy(payload.policy);
      setFormData((current) => {
        const merged = Array.from(new Set([...payload.policy!.requiredSubjectKeys, ...current.selectedSubjects]));
        return { ...current, selectedSubjects: merged.slice(0, payload.policy!.maxSubjects) };
      });
    }
    void loadPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  function getAgeRange(ageYears: number): '5-7' | '8-10' {
    return ageYears >= 8 ? '8-10' : '5-7';
  }

  function validateLocal(): FieldErrors {
    return getChildFormValidationErrors(formData, subjectPolicy);
  }

  const submitDisabledReason = saving ? null : getChildFormDisabledReason(formData, subjectPolicy);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localErrors = validateLocal();
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const ageYears = Number(formData.ageYears);
      const learningGoals = formData.learningGoals
        .split('\n')
        .map((goal) => goal.trim())
        .filter(Boolean)
        .slice(0, 8);
      const supportNeeds = formData.supportNeeds.trim();
      const payload = {
        name: formData.name.trim(),
        avatar: formData.avatar,
        ageYears,
        ageRange: getAgeRange(ageYears),
        yearGroup: formData.yearGroup.trim(),
        schoolYear: formData.schoolYear.trim(),
        dateOfBirth: formData.dateOfBirth || undefined,
        keyStageLevel: formData.keyStageLevel.trim(),
        subjectLevel: formData.subjectLevel.trim(),
        selectedSubjects: formData.selectedSubjects,
        learningGoals: learningGoals.length ? learningGoals : undefined,
        senSupportNeeds: supportNeeds || undefined,
        startLevelChoice: formData.startLevelChoice,
      };

      const url = mode === 'add' ? '/api/children' : `/api/children/${initialData?.id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        };

        if (data.fieldErrors) {
          const nextFieldErrors: FieldErrors = {};
          for (const [key, messages] of Object.entries(data.fieldErrors)) {
            if (!messages?.length) continue;
            if (key in formData) {
              nextFieldErrors[key as keyof ChildFormData] = messages[0];
            }
          }
          setFieldErrors(nextFieldErrors);
        }

        if (process.env.NODE_ENV !== 'production') {
          console.info('[children.form] validation response', data);
        }

        throw new Error(data.error || `Failed to ${mode} child`);
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="child-name" className="block text-sm font-semibold text-slate-300 mb-2">
          Child&apos;s name *
        </label>
        <input
          id="child-name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter child&apos;s first and last name"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          maxLength={64}
          aria-describedby={fieldErrors.name ? 'child-name-error' : undefined}
          required
        />
        {fieldErrors.name ? <p id="child-name-error" className="mt-1 text-xs text-red-400">{fieldErrors.name}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="child-year-group" className="block text-sm font-semibold text-slate-300 mb-2">
            Year group
          </label>
          <select
            id="child-year-group"
            value={formData.yearGroup}
            onChange={(e) => {
              const nextYear = e.target.value;
              setFormData({
                ...formData,
                yearGroup: nextYear,
                schoolYear: nextYear,
                keyStageLevel: nextYear ? keyStageForYearGroup(nextYear) : formData.keyStageLevel,
              });
            }}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            aria-describedby={fieldErrors.yearGroup ? 'child-year-group-error' : undefined}
          >
            <option value="">Select year...</option>
            {yearGroups.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          {fieldErrors.yearGroup ? <p id="child-year-group-error" className="mt-1 text-xs text-red-400">{fieldErrors.yearGroup}</p> : null}
        </div>

        <div>
          <label htmlFor="child-key-stage-auto" className="block text-sm font-semibold text-slate-300 mb-2">
            Key Stage
          </label>
          <select
            id="child-key-stage-auto"
            value={formData.keyStageLevel}
            onChange={(e) => {
              setFormData({
                ...formData,
                keyStageLevel: e.target.value,
              });
            }}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            disabled
          >
            <option value="">Select key stage...</option>
            {keyStages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Auto-calculated from year group</p>
          {fieldErrors.keyStageLevel ? <p className="mt-1 text-xs text-red-400">{fieldErrors.keyStageLevel}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="child-date-of-birth" className="block text-sm font-semibold text-slate-300 mb-2">
            Date of birth
          </label>
          <input
            id="child-date-of-birth"
            type="date"
            value={formData.dateOfBirth}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              const dob = e.target.value;
              setFormData({ ...formData, dateOfBirth: dob, ageYears: calcAgeFromDob(dob) });
            }}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            aria-describedby={fieldErrors.dateOfBirth ? 'child-date-of-birth-error' : undefined}
          />
          {fieldErrors.dateOfBirth ? <p id="child-date-of-birth-error" className="mt-1 text-xs text-red-400">{fieldErrors.dateOfBirth}</p> : null}
        </div>

        <div>
          <label htmlFor="child-age" className="block text-sm font-semibold text-slate-300 mb-2">
            Age *
          </label>
          <input
            id="child-age"
            type="number"
            value={formData.ageYears}
            readOnly
            className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-slate-300 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-slate-400">Age is calculated automatically from date of birth.</p>
          {fieldErrors.ageYears ? <p className="mt-1 text-xs text-red-400">{fieldErrors.ageYears}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="child-key-stage" className="block text-sm font-semibold text-slate-300 mb-2">
            Key stage *
          </label>
          <select
            id="child-key-stage"
            value={formData.keyStageLevel}
            onChange={(e) => setFormData({ ...formData, keyStageLevel: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            aria-describedby={fieldErrors.keyStageLevel ? 'child-key-stage-error' : undefined}
          >
            <option value="">Select key stage...</option>
            {keyStages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
          {fieldErrors.keyStageLevel ? <p id="child-key-stage-error" className="mt-1 text-xs text-red-400">{fieldErrors.keyStageLevel}</p> : null}
          {keyStageMismatch ? (
            <p className="mt-1 text-xs text-amber-300">
              Calculated key stage for {formData.yearGroup} is {expectedKeyStage}. Please double-check this selection.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="child-subject-level" className="block text-sm font-semibold text-slate-300 mb-2">
            Subject level *
          </label>
          <select
            id="child-subject-level"
            value={formData.subjectLevel}
            onChange={(e) => setFormData({ ...formData, subjectLevel: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            aria-describedby={fieldErrors.subjectLevel ? 'child-subject-level-error' : undefined}
          >
            <option value="">Select level...</option>
            {subjectLevels.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          {fieldErrors.subjectLevel ? <p id="child-subject-level-error" className="mt-1 text-xs text-red-400">{fieldErrors.subjectLevel}</p> : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Subject selection *
        </label>
        <p className="mb-2 text-xs text-slate-400">
          Select up to {subjectPolicy.maxSubjects} subjects for this term. English counts as one subject and includes reading, spelling, writing, grammar, vocabulary, comprehension, phonics, and speaking/listening.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUBJECT_OPTIONS.map((subject) => {
            const checked = formData.selectedSubjects.includes(subject.key);
            const required = subjectPolicy.requiredSubjectKeys.includes(subject.key);
            const limitReached = !checked && formData.selectedSubjects.length >= subjectPolicy.maxSubjects;
            return (
              <label key={subject.key} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${checked ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-slate-900 text-slate-300'} ${limitReached ? 'opacity-50' : ''}`}>
                <span>
                  {subject.label}
                  {subject.core ? <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">Core</span> : null}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={required || limitReached}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...formData.selectedSubjects, subject.key]
                      : formData.selectedSubjects.filter((entry) => entry !== subject.key);
                    const deduped = Array.from(new Set([...subjectPolicy.requiredSubjectKeys, ...next]));
                    setFormData({ ...formData, selectedSubjects: deduped.slice(0, subjectPolicy.maxSubjects) });
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Avatar
        </label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-12">
          {AVATAR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, avatar: option.value })}
              className={`flex flex-col items-center rounded-xl border-2 p-2 transition ${
                formData.avatar === option.value
                  ? 'border-cyan-400 bg-cyan-400/10'
                  : 'border-white/10 bg-slate-900 hover:border-white/30'
              }`}
            >
              <span className="text-2xl leading-none" role="img" aria-label={option.label}>{option.emoji}</span>
              <p className="mt-1 text-[10px] text-slate-300">{option.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Learning goals (one per line)
        </label>
        <textarea
          value={formData.learningGoals}
          onChange={(e) => setFormData({ ...formData, learningGoals: e.target.value })}
          placeholder="One goal per line, e.g. Improve spelling confidence"
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          maxLength={500}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Support needs
        </label>
        <textarea
          value={formData.supportNeeds}
          onChange={(e) => setFormData({ ...formData, supportNeeds: e.target.value })}
          placeholder="SEN support notes, accommodations, or preferred support style"
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          maxLength={500}
        />
      </div>

      <div className="flex flex-col gap-3 pt-4 sm:flex-row">
        <Button type="submit" disabled={saving || Boolean(submitDisabledReason)} aria-describedby={submitDisabledReason ? 'child-form-submit-help' : undefined}>
          {saving ? 'Saving...' : mode === 'add' ? 'Add child' : 'Save changes'}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="bg-slate-800 hover:bg-slate-700"
        >
          Cancel
        </Button>
      </div>
      {submitDisabledReason ? (
        <p id="child-form-submit-help" className="text-xs text-slate-400" aria-live="polite">
          {submitDisabledReason}
        </p>
      ) : null}
    </form>
  );
}
