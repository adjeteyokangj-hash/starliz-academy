"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePassword } from "@/lib/password";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

export default function NewParentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [timezone, setTimezone] = useState("Europe/London");
  const [parentRole, setParentRole] = useState("parent");
  const [status, setStatus] = useState<"active" | "pending" | "suspended">("active");
  const [emailVerified, setEmailVerified] = useState(false);
  const [forcePasswordReset, setForcePasswordReset] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [numberOfChildren, setNumberOfChildren] = useState("1");
  const [preferredLearningFocus, setPreferredLearningFocus] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [trialStatus, setTrialStatus] = useState("trial");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [stripeCustomerId, setStripeCustomerId] = useState("");
  const [paystackCustomerId, setPaystackCustomerId] = useState("");
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [deviceTrackingJson, setDeviceTrackingJson] = useState("");
  const [emailConsent, setEmailConsent] = useState(true);
  const [smsConsent, setSmsConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
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
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      setError("All fields are required");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          whatsappNumber,
          address,
          country,
          timezone,
          parentRole,
          status,
          emailVerified,
          forcePasswordReset,
          mfaEnabled,
          numberOfChildren: numberOfChildren ? Number(numberOfChildren) : undefined,
          preferredLearningFocus,
          schoolType,
          curriculum,
          trialStatus,
          subscriptionPlan,
          stripeCustomerId,
          paystackCustomerId,
          lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : undefined,
          deviceTrackingJson,
          emailConsent,
          smsConsent,
          whatsappConsent,
          password,
        }),
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

          <label className="block text-sm font-bold text-slate-300">
            Mobile Number *
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="+44 7000 000000"
            />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            WhatsApp Number
            <input
              value={whatsappNumber}
              onChange={(event) => setWhatsappNumber(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="+44 7000 000000"
            />
          </label>

          <label className="block text-sm font-bold text-slate-300">
            Address
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
              placeholder="House number, street, city"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Country
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Timezone
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Parent Role
              <input
                value={parentRole}
                onChange={(event) => setParentRole(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Number Of Children
              <input
                type="number"
                min={0}
                value={numberOfChildren}
                onChange={(event) => setNumberOfChildren(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "pending" | "suspended")}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
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

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={forcePasswordReset}
                onChange={(event) => setForcePasswordReset(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
              />
              Force password reset on first login
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={mfaEnabled}
                onChange={(event) => setMfaEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
              />
              MFA enabled
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={emailVerified}
                onChange={(event) => setEmailVerified(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
              />
              Email verified
            </label>

            <label className="mt-3 block text-sm font-bold text-slate-300">
              Last Login
              <input
                type="datetime-local"
                value={lastLoginAt}
                onChange={(event) => setLastLoginAt(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">Child Preferences</legend>
          <label className="block text-sm font-bold text-slate-300">
            Preferred Learning Focus
            <input
              value={preferredLearningFocus}
              onChange={(event) => setPreferredLearningFocus(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              School Type
              <input
                value={schoolType}
                onChange={(event) => setSchoolType(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Curriculum
              <input
                value={curriculum}
                onChange={(event) => setCurriculum(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">Billing</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Trial Status
              <input
                value={trialStatus}
                onChange={(event) => setTrialStatus(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Subscription Plan
              <input
                value={subscriptionPlan}
                onChange={(event) => setSubscriptionPlan(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Stripe Customer ID
              <input
                value={stripeCustomerId}
                onChange={(event) => setStripeCustomerId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Paystack Customer ID
              <input
                value={paystackCustomerId}
                onChange={(event) => setPaystackCustomerId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">Device Tracking</legend>
          <label className="block text-sm font-bold text-slate-300">
            Device Tracking JSON
            <textarea
              value={deviceTrackingJson}
              onChange={(event) => setDeviceTrackingJson(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              placeholder='{"devices":[{"name":"iPad","lastSeen":"2026-05-12T12:00:00.000Z"}]}'
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">
            Consent Settings
          </legend>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(event) => setEmailConsent(event.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
            />
            Email consent
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(event) => setSmsConsent(event.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
            />
            SMS consent
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(event) => setWhatsappConsent(event.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
            />
            WhatsApp consent
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

