"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generatePassword as generateSecurePassword } from "@/lib/password";
import { normalizeUkPhone, normalizeUkPostcode } from "@/lib/uk_contact";
import Button from "@/components/ui/Button";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  addressLine1?: string;
  townCity?: string;
  postcode?: string;
  country?: string;
};

type SignupState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  county: string;
  postcode: string;
  country: string;
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SignupState>({
    name: "",
    email: "",
    password: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    townCity: "",
    county: "",
    postcode: "",
    country: "United Kingdom",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedPreview = useMemo(() => {
    let normalizedPhoneDisplay: string | null = null;
    let normalizedPostcode: string | null = null;
    let phoneError: string | null = null;
    let postcodeError: string | null = null;
    let countryValue = form.country.trim() || "United Kingdom";

    if (form.phone.trim()) {
      try {
        normalizedPhoneDisplay = normalizeUkPhone(form.phone).display;
      } catch (previewError) {
        phoneError = previewError instanceof Error ? previewError.message : "Enter a valid UK phone number.";
      }
    }

    if (form.postcode.trim()) {
      try {
        normalizedPostcode = normalizeUkPostcode(form.postcode);
      } catch (previewError) {
        postcodeError = previewError instanceof Error ? previewError.message : "Enter a valid UK postcode.";
      }
    }

    const countryLower = countryValue.toLowerCase();
    if (countryLower === "uk" || countryLower === "u.k." || countryLower === "great britain") {
      countryValue = "United Kingdom";
    }

    return {
      normalizedPhoneDisplay,
      normalizedPostcode,
      normalizedCountry: countryValue,
      phoneError,
      postcodeError,
    };
  }, [form.country, form.phone, form.postcode]);

  function updateField<K extends keyof SignupState>(key: K, value: SignupState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key as keyof FieldErrors]) return prev;
      return { ...prev, [key]: undefined };
    });
  }

  function validateForm(): { valid: true; normalizedPhone: string; normalizedPostcode: string; normalizedCountry: string } | { valid: false } {
    const nextErrors: FieldErrors = {};

    if (!form.name.trim()) nextErrors.name = "Full name is required.";
    if (!form.email.trim()) nextErrors.email = "Email is required.";
    if (!form.password.trim()) nextErrors.password = "Password is required.";
    if (!form.phone.trim()) nextErrors.phone = "UK phone number is required.";
    if (!form.addressLine1.trim()) nextErrors.addressLine1 = "Address line 1 is required.";
    if (!form.townCity.trim()) nextErrors.townCity = "Town/City is required.";
    if (!form.postcode.trim()) nextErrors.postcode = "Postcode is required.";

    let normalizedPhone: string | null = null;
    if (!nextErrors.phone) {
      try {
        normalizedPhone = normalizeUkPhone(form.phone).e164;
      } catch (validationError) {
        nextErrors.phone = validationError instanceof Error ? validationError.message : "Enter a valid UK phone number.";
      }
    }

    let normalizedPostcode: string | null = null;
    if (!nextErrors.postcode) {
      try {
        normalizedPostcode = normalizeUkPostcode(form.postcode);
      } catch (validationError) {
        nextErrors.postcode = validationError instanceof Error ? validationError.message : "Enter a valid UK postcode.";
      }
    }

    let normalizedCountry = form.country.trim() || "United Kingdom";
    const countryLower = normalizedCountry.toLowerCase();
    if (countryLower === "uk" || countryLower === "u.k." || countryLower === "great britain") {
      normalizedCountry = "United Kingdom";
    }
    if (normalizedCountry.toLowerCase() !== "united kingdom") {
      nextErrors.country = "Country must be United Kingdom.";
    }

    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || !normalizedPhone || !normalizedPostcode) {
      return { valid: false };
    }

    return {
      valid: true,
      normalizedPhone,
      normalizedPostcode,
      normalizedCountry,
    };
  }

  function generatePassword() {
    const generated = generateSecurePassword();
    setForm((prev) => ({ ...prev, password: generated }));
    setShowPassword(true);
    setPasswordMessage("Strong password generated.");
  }

  async function copyPassword() {
    if (!form.password) {
      setPasswordMessage("Generate or enter a password first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(form.password);
      setPasswordMessage("Password copied.");
    } catch {
      setPasswordMessage("Could not copy password.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const validation = validateForm();
    if (!validation.valid) {
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: validation.normalizedPhone,
          address: {
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2 || undefined,
            townCity: form.townCity,
            county: form.county || undefined,
            postcode: validation.normalizedPostcode,
            country: validation.normalizedCountry,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Sign up failed.");
        return;
      }
      router.replace("/consent");
    } catch {
      setError("Unable to sign up right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-4 sm:py-10">
      <section className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white/90 p-6 sm:p-8 shadow-xl ring-1 ring-slate-200">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">StarLiz Academy</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-black text-slate-900">Create Parent Account</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600">Create your secure account to manage multiple children and saved progress.</p>

        <form className="mt-6 space-y-3 sm:space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Full name
            <input
              type="text"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {fieldErrors.name ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.name}</p> : null}
          </label>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {fieldErrors.email ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.email}</p> : null}
          </label>
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700" htmlFor="signup-password">
              Password
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) => {
                  updateField("password", e.target.value);
                  setPasswordMessage(null);
                }}
                className="min-w-0 flex-1 rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="rounded-lg sm:rounded-xl border border-slate-300 bg-white px-2 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg sm:rounded-xl bg-secondary px-3 py-2 text-xs sm:text-sm font-bold text-white"
                onClick={generatePassword}
              >
                Generate password
              </button>
              <button
                type="button"
                className="rounded-lg sm:rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-700"
                onClick={() => void copyPassword()}
              >
                Copy
              </button>
            </div>
            {passwordMessage ? <p className="mt-2 text-xs sm:text-sm font-semibold text-slate-600">{passwordMessage}</p> : null}
            {fieldErrors.password ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.password}</p> : null}
          </div>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            UK phone number
            <input
              type="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="07... or +44..."
            />
            {fieldErrors.phone ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.phone}</p> : null}
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Address line 1
            <input
              type="text"
              autoComplete="address-line1"
              required
              value={form.addressLine1}
              onChange={(e) => updateField("addressLine1", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {fieldErrors.addressLine1 ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.addressLine1}</p> : null}
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Address line 2 (optional)
            <input
              type="text"
              autoComplete="address-line2"
              value={form.addressLine2}
              onChange={(e) => updateField("addressLine2", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Town/City
            <input
              type="text"
              autoComplete="address-level2"
              required
              value={form.townCity}
              onChange={(e) => updateField("townCity", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {fieldErrors.townCity ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.townCity}</p> : null}
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            County (optional)
            <input
              type="text"
              autoComplete="address-level1"
              value={form.county}
              onChange={(e) => updateField("county", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Postcode
            <input
              type="text"
              autoComplete="postal-code"
              required
              value={form.postcode}
              onChange={(e) => updateField("postcode", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase"
            />
            {fieldErrors.postcode ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.postcode}</p> : null}
          </label>

          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Country
            <input
              type="text"
              autoComplete="country-name"
              required
              value={form.country}
              onChange={(e) => updateField("country", e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            {fieldErrors.country ? <p className="mt-1 text-xs font-semibold text-rose-700">{fieldErrors.country}</p> : null}
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm text-slate-700">
            <p className="font-bold text-slate-800">Normalization preview</p>
            <p className="mt-1">Phone: {normalizedPreview.normalizedPhoneDisplay ?? "-"}</p>
            {normalizedPreview.phoneError ? <p className="mt-1 font-semibold text-rose-700">{normalizedPreview.phoneError}</p> : null}
            <p className="mt-1">Postcode: {normalizedPreview.normalizedPostcode ?? "-"}</p>
            {normalizedPreview.postcodeError ? <p className="mt-1 font-semibold text-rose-700">{normalizedPreview.postcodeError}</p> : null}
            <p className="mt-1">Country: {normalizedPreview.normalizedCountry}</p>
          </div>

          {error ? <p className="text-xs sm:text-sm font-semibold text-rose-700">{error}</p> : null}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="mt-4 text-xs sm:text-sm text-slate-600">
          Already have an account? <Link href="/auth/login" className="font-bold text-primary">Login</Link>
        </p>
      </section>
    </main>
  );
}
