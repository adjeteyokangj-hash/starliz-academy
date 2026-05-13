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

export default function ChildManagementForm({ mode, initialData, onSuccess, onCancel }: ChildManagementFormProps) {
  const [formData, setFormData] = useState<ChildFormData>(
    initialData || {
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
      avatar: 'blue',
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const avatarOptions = [
    { value: 'blue', cardClass: 'from-sky-400 to-cyan-500' },
    { value: 'emerald', cardClass: 'from-emerald-400 to-teal-500' },
    { value: 'rose', cardClass: 'from-rose-400 to-orange-500' },
    { value: 'violet', cardClass: 'from-violet-400 to-indigo-500' },
  ];

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
    if (!formData.ageYears) nextErrors.ageYears = 'Age is required.';
    if (typeof formData.ageYears === 'number' && (formData.ageYears < 3 || formData.ageYears > 18)) {
      nextErrors.ageYears = 'Age must be between 3 and 18.';
    }
    return nextErrors;
  }

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!parts.length) return 'ST';
    return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
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
            onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
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
            onChange={(e) => setFormData({ ...formData, ageYears: e.target.value ? Number(e.target.value) : '' })}
            placeholder="e.g., 7"
            min="3"
            max="18"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {avatarOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, avatar: option.value })}
              className={`rounded-xl border-2 p-3 transition ${
                formData.avatar === option.value
                  ? 'border-cyan-400 bg-cyan-400/10'
                  : 'border-white/10 bg-slate-900 hover:border-white/30'
              }`}
            >
              <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${option.cardClass} text-sm font-black text-white`}>
                {initials(formData.name)}
              </div>
              <p className="mt-2 text-xs text-slate-300">{option.value}</p>
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
          placeholder="Improve spelling confidence\nRead 20 minutes daily"
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
