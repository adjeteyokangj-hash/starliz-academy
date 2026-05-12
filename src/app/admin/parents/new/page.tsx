"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { generatePassword } from "@/lib/password";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type DeviceCard = {
  name: string;
  browser: string;
  lastSeen: string;
  ipAddress: string;
  trusted: boolean;
};

const COUNTRY_OPTIONS = ["United Kingdom", "United States", "Ghana", "Nigeria", "Canada"];
const TIMEZONE_OPTIONS = ["Europe/London", "Africa/Accra", "Africa/Lagos", "America/New_York"];
const SCHOOL_TYPE_OPTIONS = ["Public", "Private", "Homeschool", "International"];
const CURRICULUM_OPTIONS = ["British", "IB", "American", "Cambridge", "Nigerian", "Ghanaian"];
const TRIAL_OPTIONS = ["trial", "active", "expired", "none"];
const PLAN_OPTIONS = ["free", "monthly", "yearly"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

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
  const [subscriptionPlan, setSubscriptionPlan] = useState("free");
  const [stripeCustomerId, setStripeCustomerId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [parentNotes, setParentNotes] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [secondaryGuardianName, setSecondaryGuardianName] = useState("");
  const [secondaryGuardianPhone, setSecondaryGuardianPhone] = useState("");
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [deviceTrackingJson, setDeviceTrackingJson] = useState("");
  const [devices, setDevices] = useState<DeviceCard[]>([
    { name: "", browser: "", lastSeen: "", ipAddress: "", trusted: true },
  ]);
  const [emailConsent, setEmailConsent] = useState(true);
  const [smsConsent, setSmsConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailError = email.trim() && !EMAIL_REGEX.test(email.trim()) ? "Use a valid email address." : null;
  const passwordError =
    password && !STRONG_PASSWORD_REGEX.test(password)
      ? "Use 8+ chars with upper/lowercase, number, and symbol."
      : null;

  const deviceJsonError = (() => {
    if (!deviceTrackingJson.trim()) return null;
    try {
      JSON.parse(deviceTrackingJson);
      return null;
    } catch {
      return "Device JSON is invalid.";
    }
  })();

  const deviceCardError = devices.some((device) => device.name.trim() === "")
    ? "Each device card needs a device name."
    : null;

  function handleGeneratePassword() {
    const generated = generatePassword();
    setPassword(generated);
    setShowPassword(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      setError("All fields are required");
      return;
    }
    if (emailError || passwordError || deviceJsonError || deviceCardError) {
      setError("Please fix validation errors before creating the parent account.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const nonEmptyDevices = devices
        .filter((device) => device.name.trim())
        .map((device) => ({
          name: device.name.trim(),
          browser: device.browser.trim() || undefined,
          lastSeen: device.lastSeen ? new Date(device.lastSeen).toISOString() : undefined,
          ipAddress: device.ipAddress.trim() || undefined,
          trusted: device.trusted,
        }));

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
          avatarUrl,
          parentNotes,
          emergencyContactName,
          emergencyContactPhone,
          secondaryGuardianName,
          secondaryGuardianPhone,
          lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : undefined,
          deviceTrackingJson,
          devices: nonEmptyDevices,
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
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminSectionCard title="Add Parent" eyebrow="Accounts">
      <form onSubmit={submit} className="max-w-4xl space-y-6">
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
              placeholder="Parent full name"
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
              placeholder="parent@example.com"
            />
            {attemptedSubmit && emailError ? <p className="mt-1 text-xs text-rose-300">{emailError}</p> : null}
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
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Timezone
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {TIMEZONE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Parent Role
              <select
                value={parentRole}
                onChange={(event) => setParentRole(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="parent">Parent</option>
                <option value="guardian">Guardian</option>
                <option value="caregiver">Caregiver</option>
              </select>
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Avatar URL
              <input
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                placeholder="https://cdn.example.com/avatar.png"
              />
            </label>
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
              <p className="font-semibold text-slate-100">Email verification badge</p>
              <p className="mt-1 text-xs text-slate-400">
                {emailVerified ? "Verified badge will display on parent profile." : "No verification badge yet."}
              </p>
            </div>
          </div>

          <label className="block text-sm font-bold text-slate-300">
            Parent Notes
            <textarea
              value={parentNotes}
              onChange={(event) => setParentNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              placeholder="Onboarding context, communication notes, support history"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Emergency Contact Name
              <input
                value={emergencyContactName}
                onChange={(event) => setEmergencyContactName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Emergency Contact Phone
              <input
                value={emergencyContactPhone}
                onChange={(event) => setEmergencyContactPhone(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Secondary Guardian Name
              <input
                value={secondaryGuardianName}
                onChange={(event) => setSecondaryGuardianName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Secondary Guardian Phone
              <input
                value={secondaryGuardianPhone}
                onChange={(event) => setSecondaryGuardianPhone(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
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
            {attemptedSubmit && passwordError ? (
              <p className="mt-1 text-xs text-rose-300">{passwordError}</p>
            ) : null}
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
              <select
                value={schoolType}
                onChange={(event) => setSchoolType(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">Select school type</option>
                {SCHOOL_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Curriculum
              <select
                value={curriculum}
                onChange={(event) => setCurriculum(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="">Select curriculum</option>
                {CURRICULUM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">Billing</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-bold text-slate-300">
              Trial Status
              <select
                value={trialStatus}
                onChange={(event) => setTrialStatus(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {TRIAL_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-300">
              Subscription Plan
              <select
                value={subscriptionPlan}
                onChange={(event) => setSubscriptionPlan(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {PLAN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-1">
            <label className="block text-sm font-bold text-slate-300">
              Stripe Customer ID
              <input
                value={stripeCustomerId}
                onChange={(event) => setStripeCustomerId(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
            <p className="text-xs text-slate-500">Paystack operations are hidden for now and managed internally.</p>
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <legend className="text-sm font-bold uppercase tracking-wide text-slate-400">Device Tracking</legend>
          <div className="space-y-3">
            {devices.map((device, index) => (
              <div key={`device-${index}`} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-400">
                    Device Name
                    <input
                      value={device.name}
                      onChange={(event) => {
                        const next = [...devices];
                        next[index] = { ...next[index], name: event.target.value };
                        setDevices(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                      placeholder="iPad - Living Room"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-400">
                    Browser/App
                    <input
                      value={device.browser}
                      onChange={(event) => {
                        const next = [...devices];
                        next[index] = { ...next[index], browser: event.target.value };
                        setDevices(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-400">
                    Last Seen
                    <input
                      type="datetime-local"
                      value={device.lastSeen}
                      onChange={(event) => {
                        const next = [...devices];
                        next[index] = { ...next[index], lastSeen: event.target.value };
                        setDevices(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-400">
                    IP Address
                    <input
                      value={device.ipAddress}
                      onChange={(event) => {
                        const next = [...devices];
                        next[index] = { ...next[index], ipAddress: event.target.value };
                        setDevices(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={device.trusted}
                      onChange={(event) => {
                        const next = [...devices];
                        next[index] = { ...next[index], trusted: event.target.checked };
                        setDevices(next);
                      }}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500"
                    />
                    Trusted device
                  </label>
                  <button
                    type="button"
                    onClick={() => setDevices((current) => current.filter((_, i) => i !== index))}
                    className="text-xs font-semibold text-rose-300 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setDevices((current) => [
                ...current,
                { name: "", browser: "", lastSeen: "", ipAddress: "", trusted: false },
              ])
            }
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
          >
            Add Device
          </button>
          {attemptedSubmit && deviceCardError ? <p className="text-xs text-rose-300">{deviceCardError}</p> : null}

          <label className="block text-sm font-bold text-slate-300">
            Advanced Device JSON (optional override)
            <textarea
              value={deviceTrackingJson}
              onChange={(event) => setDeviceTrackingJson(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              placeholder='{"devices":[{"name":"iPad","lastSeen":"2026-05-12T12:00:00.000Z"}]}'
            />
          </label>
          {attemptedSubmit && deviceJsonError ? <p className="text-xs text-rose-300">{deviceJsonError}</p> : null}
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

