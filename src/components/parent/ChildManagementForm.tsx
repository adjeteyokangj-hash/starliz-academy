'use client';

import { useState, FormEvent } from 'react';
import Button from '@/components/ui/Button';

type ChildFormData = {
  name: string;
  yearGroup: string;
  age: number | '';
  avatar: string;
  learningNeeds: string;
};

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
      yearGroup: '',
      age: '',
      avatar: 'avatar1',
      learningNeeds: '',
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarOptions = [
    { value: 'avatar1', label: '🧑‍🎓' },
    { value: 'avatar2', label: '👦' },
    { value: 'avatar3', label: '👧' },
    { value: 'avatar4', label: '🤓' },
  ];

  const yearGroups = ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11'];

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Child name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        yearGroup: formData.yearGroup || null,
        age: formData.age ? Number(formData.age) : null,
        avatar: formData.avatar,
        // Store learning needs in a custom field or notes
        senSupportNeeds: formData.learningNeeds || null,
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
        const data = await response.json().catch(() => ({}));
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
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Age
          </label>
          <input
            type="number"
            value={formData.age}
            onChange={(e) => setFormData({ ...formData, age: e.target.value ? Number(e.target.value) : '' })}
            placeholder="e.g., 7"
            min="3"
            max="18"
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Avatar
        </label>
        <div className="grid grid-cols-4 gap-2">
          {avatarOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, avatar: option.value })}
              className={`rounded-xl border-2 p-3 text-2xl transition ${
                formData.avatar === option.value
                  ? 'border-cyan-400 bg-cyan-400/10'
                  : 'border-white/10 bg-slate-900 hover:border-white/30'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-2">
          Learning needs / notes
        </label>
        <textarea
          value={formData.learningNeeds}
          onChange={(e) => setFormData({ ...formData, learningNeeds: e.target.value })}
          placeholder="Any additional information about learning preferences..."
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          maxLength={500}
        />
      </div>

      <div className="flex gap-3 pt-4">
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
