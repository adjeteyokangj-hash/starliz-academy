"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePassword } from "@/lib/password";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

export default function NewParentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleGeneratePassword() {
    const generated = generatePassword();
    setPassword(generated);
    setShowPassword(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to create parent.");
        return;
      }
      router.replace(`/admin/parents/${payload.parent.id}`);
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminSectionCard title="Add Parent" eyebrow="Accounts">
      <form onSubmit={submit} className="max-w-2xl space-y-6">
        {/* Basic Information */}
        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Parent Information
          </legend>

          <label className="block text-sm font-bold text-slate-300">
            Full Name *
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Eddie Okang"
            />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Email Address *
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="eddie@example.com"
            />
          </label>
        </fieldset>

        {/* Security */}
        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Security
          </legend>

          <div>
            <label className="block text-sm font-bold text-slate-300">
              Temporary Password *
            </label>
            <div className="mt-2 flex gap-2">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                onClick={handleGeneratePassword}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-indigo-400 hover:bg-slate-700"
              >
                Generate
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Password must be at least 8 characters with uppercase, lowercase, digits, and symbols.
            </p>
          </div>
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
            {isSubmitting ? "Creating..." : "Create Parent"}
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

