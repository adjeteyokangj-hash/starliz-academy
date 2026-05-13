'use client';

import { useState, FormEvent } from 'react';
import Button from '@/components/ui/Button';

type ChildFormData = {
  name: string;
  dateOfBirth: string;
  schoolYear: string;
  yearGroup: string;
  keyStageLevel: string;
  subjectLevel: string;
  learningGoals: string;
  supportNeeds: string;
  ageYears: number | '';
  startLevelChoice: 'Beginner' | 'Intermediate' | 'Confident';
  avatar: string;
};

type FieldErrors = Partial<Record<keyof ChildFormData, string>>;

type ChildManagementFormProps = {
  mode: 'add' | 'edit';
  initialData?: ChildFormData & { id: string };
  onSuccess: () => void;
  onCancel: () => void;
};

const AVATAR_OPTIONS = [
  { value: 'star',    emoji: '⭐', label: 'Star' },
  { value: 'rocket',  emoji: '🚀', label: 'Rocket' },
  { value: 'owl',     emoji: '🦉', label: 'Owl' },
  { value: 'lion',    emoji: '🦁', label: 'Lion' },
  { value: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { value: 'robot',   emoji: '🤖', label: 'Robot' },
  { value: 'book',    emoji: '📚', label: 'Book' },
  { value: 'rainbow', emoji: '🌈', label: 'Rainbow' },
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

export default function ChildManagementForm({ mode, initialData, onSuccess, onCancel }: ChildManagementFormProps) {
  const [formData, setFormData] = useState<ChildFormData>(() => {
    if (initialData) {
      const computedAge = initialData.dateOfBirth
        ? calcAgeFromDob(initialData.dateOfBirth)
        : initialData.ageYears;
      return { ...initialData, ageYears: computedAge };
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
      ageYears: '',
      startLevelChoice: 'Beginner',
      avatar: 'star',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const yearGroups = ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11'];
  const keyStages = ['EYFS', 'KS1', 'KS2', 'KS3', 'KS4'];
  const subjectLevels = ['Foundation', 'Core', 'Developing', 'Secure', 'Greater Depth'];

  function getAgeRange(ageYears: number): '5-7' | '8-10' {
    return ageYears >= 8 ? '8-10' : '5-7';
  }

  function validateLocal(): FieldErrors {
    const nextErrors: FieldErrors = {};
    if (!formData.name.trim()) nextErrors.name = 'Child name is required.';
    if (!formData.yearGroup.trim()) nextErrors.yearGroup = 'Please choose a year group.';
    if (!formData.schoolYear.trim()) nextErrors.schoolYear = 'Please choose a school year.';
    if (!formData.keyStageLevel.trim()) nextErrors.keyStageLevel = 'Please choose a key stage.';
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
    return nextErrors;
  }

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
      const payload = {
        name: formData.name.trim(),
        avatar: formData.avatar,
        ageYears,
        ageRange: getAgeRange(ageYears),
        yearGroup: formData.yearGroup,
        schoolYear: formData.schoolYear,
        dateOfBirth: formData.dateOfBirth || undefined,
        keyStageLevel: formData.keyStageLevel,
        subjectLevel: formData.subjectLevel,
        learningGoals: formData.learningGoals
          .split('\n')
          .map((goal) => goal.trim())
          .filter(Boolean),
        senSupportNeeds: formData.supportNeeds || undefined,
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
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Child&apos;s name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter child&apos;s first and last name"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          maxLength={100}
          required
        />
        {fieldErrors.name ? <p className="mt-1 text-xs text-red-400">{fieldErrors.name}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Year group
          </label>
          <select
            value={formData.yearGroup}
            onChange={(e) => setFormData({ ...formData, yearGroup: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Select year...</option>
            {yearGroups.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          {fieldErrors.yearGroup ? <p className="mt-1 text-xs text-red-400">{fieldErrors.yearGroup}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            School year
          </label>
          <select
            value={formData.schoolYear}
            onChange={(e) => setFormData({ ...formData, schoolYear: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Select school year...</option>
            {yearGroups.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          {fieldErrors.schoolYear ? <p className="mt-1 text-xs text-red-400">{fieldErrors.schoolYear}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Date of birth
          </label>
          <input
            type="date"
            value={formData.dateOfBirth}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              const dob = e.target.value;
              setFormData({ ...formData, dateOfBirth: dob, ageYears: calcAgeFromDob(dob) });
            }}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
          {fieldErrors.dateOfBirth ? <p className="mt-1 text-xs text-red-400">{fieldErrors.dateOfBirth}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Age *
          </label>
          <input
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
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Key stage *
          </label>
          <select
            value={formData.keyStageLevel}
            onChange={(e) => setFormData({ ...formData, keyStageLevel: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Select key stage...</option>
            {keyStages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
          {fieldErrors.keyStageLevel ? <p className="mt-1 text-xs text-red-400">{fieldErrors.keyStageLevel}</p> : null}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Subject level *
          </label>
          <select
            value={formData.subjectLevel}
            onChange={(e) => setFormData({ ...formData, subjectLevel: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="">Select level...</option>
            {subjectLevels.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          {fieldErrors.subjectLevel ? <p className="mt-1 text-xs text-red-400">{fieldErrors.subjectLevel}</p> : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Avatar
        </label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
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
        <Button type="submit" disabled={saving}>
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
    </form>
  );
}
