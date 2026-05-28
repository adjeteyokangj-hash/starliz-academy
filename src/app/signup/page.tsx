"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { generatePassword as generateSecurePassword } from "@/lib/password";
import {
  normalizeUkPhone,
  normalizeUkPostcode,
  serializeUkAddress,
  validateParentEmailQuality,
  validateParentFullName,
} from "@/lib/uk_contact";
import Logo from "@/components/Logo";
import PublicShell from "@/components/layout/PublicShell";
import {
  AVATAR_OPTIONS,
  calculateAgeFromDateOfBirth,
  getStageForYearGroup,
  getSubjectOptionsForYearGroup,
  LEARNING_CONFIDENCE_OPTIONS,
  LEARNING_FOCUS_OPTIONS,
  mapLearningFocusToLegacyMainFocus,
  suggestUkYearGroupFromDateOfBirth,
  UK_YEAR_GROUP_OPTIONS,
  validateRequiredConsents,
} from "@/lib/registration/child-profile-options";

type Toast = { type: "success" | "error"; message: string } | null;

type SignupErrors = Partial<Record<
  | "parentName"
  | "email"
  | "phone"
  | "password"
  | "confirmPassword"
  | "addressLine1"
  | "townCity"
  | "postcode"
  | "childName"
  | "childDateOfBirth"
  | "yearGroup"
  | "subjects"
  | "focus"
  | "guardianConsent"
  | "learningProfileConsent"
  | "termsConsent"
  | "general",
  string
>>;

const inputCls =
  "mt-2 w-full rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUkPhone(value: string): boolean {
  try {
    normalizeUkPhone(value);
    return true;
  } catch {
    return false;
  }
}

function isValidUkPostcode(value: string): boolean {
  try {
    normalizeUkPostcode(value);
    return true;
  } catch {
    return false;
  }
}

function progressWidthClass(value: number): string {
  if (value >= 100) return "w-full";
  if (value >= 88) return "w-11/12";
  if (value >= 75) return "w-3/4";
  if (value >= 63) return "w-2/3";
  if (value >= 50) return "w-1/2";
  if (value >= 38) return "w-2/5";
  if (value >= 25) return "w-1/4";
  if (value >= 13) return "w-1/6";
  return "w-1/12";
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email")?.trim().toLowerCase() ?? "";

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [townCity, setTownCity] = useState("");
  const [county, setCounty] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [childName, setChildName] = useState("");
  const [childDateOfBirth, setChildDateOfBirth] = useState("");
  const [yearGroup, setYearGroup] = useState<string>("Reception");
  const [yearGroupLockedByParent, setYearGroupLockedByParent] = useState(false);
  const [avatar, setAvatar] = useState<string>(AVATAR_OPTIONS[0]);

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [learningFocus, setLearningFocus] = useState<string>(LEARNING_FOCUS_OPTIONS[0].label);
  const [learningConfidence, setLearningConfidence] = useState<string>(LEARNING_CONFIDENCE_OPTIONS[1]);

  const [guardianConsent, setGuardianConsent] = useState(false);
  const [learningProfileConsent, setLearningProfileConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [errors, setErrors] = useState<SignupErrors>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const calculatedAge = useMemo(() => {
    return childDateOfBirth ? calculateAgeFromDateOfBirth(childDateOfBirth) : null;
  }, [childDateOfBirth]);

  const suggestedYearGroup = useMemo(() => {
    return childDateOfBirth ? suggestUkYearGroupFromDateOfBirth(childDateOfBirth) : null;
  }, [childDateOfBirth]);

  useEffect(() => {
    if (!suggestedYearGroup || yearGroupLockedByParent) return;
    setYearGroup(suggestedYearGroup);
  }, [suggestedYearGroup, yearGroupLockedByParent]);

  const stage = useMemo(() => getStageForYearGroup(yearGroup), [yearGroup]);

  const stageSubjects = useMemo(() => {
    return [...getSubjectOptionsForYearGroup(yearGroup)];
  }, [yearGroup]);

  useEffect(() => {
    setSelectedSubjects((current) => {
      const retained = current.filter((subject) => stageSubjects.includes(subject));
      if (retained.length > 0) return retained;
      return [...stageSubjects];
    });
  }, [stageSubjects]);

  const visibleFocusOptions = useMemo(() => {
    return LEARNING_FOCUS_OPTIONS.map((option) => {
      const allowed = !("stages" in option) || option.stages.includes(stage as "KS4 / GCSE");
      return { ...option, allowed };
    });
  }, [stage]);

  useEffect(() => {
    if (toast === null) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const completion = useMemo(() => {
    const checks = [
      parentName.trim().length > 0,
      isValidEmail(email),
      isValidUkPhone(phone),
      addressLine1.trim().length > 0,
      townCity.trim().length > 0,
      isValidUkPostcode(postcode),
      password.length >= 8,
      confirmPassword === password && confirmPassword.length > 0,
      childName.trim().length > 0,
      Boolean(childDateOfBirth),
      Boolean(yearGroup),
      selectedSubjects.length > 0,
      Boolean(learningFocus),
      Boolean(learningConfidence),
      validateRequiredConsents({
        isGuardianConfirmed: guardianConsent,
        learningProfileConsent,
        termsPrivacyConsent: termsConsent,
      }),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [
    parentName,
    email,
    phone,
    addressLine1,
    townCity,
    postcode,
    password,
    confirmPassword,
    childName,
    childDateOfBirth,
    yearGroup,
    selectedSubjects,
    learningFocus,
    learningConfidence,
    guardianConsent,
    learningProfileConsent,
    termsConsent,
  ]);

  function validateStepOne(): SignupErrors {
    const next: SignupErrors = {};
    if (!parentName.trim()) {
      next.parentName = "Please enter your real full name.";
    } else {
      try {
        validateParentFullName(parentName);
      } catch {
        next.parentName = "Please enter your real full name.";
      }
    }

    if (!email.trim() || !isValidEmail(email)) {
      next.email = "Enter a valid email address.";
    } else {
      try {
        validateParentEmailQuality(email);
      } catch {
        next.email = "Please use a real email address.";
      }
    }

    if (!phone.trim() || !isValidUkPhone(phone)) next.phone = "Please enter a valid UK phone number.";

    try {
      serializeUkAddress({
        addressLine1,
        addressLine2,
        townCity,
        county,
        postcode,
        country,
      });
    } catch {
      next.addressLine1 = "Please enter a valid UK address.";
      next.townCity = "Please enter a valid UK address.";
      if (!isValidUkPostcode(postcode)) {
        next.postcode = "Enter a valid UK postcode.";
      }
    }

    if (!password || password.length < 8) next.password = "Password must be at least 8 characters.";
    if (!confirmPassword) next.confirmPassword = "Confirm your password.";
    if (password && confirmPassword && password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }

    return next;
  }

  function validateStepTwo(): SignupErrors {
    const next: SignupErrors = {};
    if (!childName.trim()) next.childName = "Child first name is required.";
    if (!childDateOfBirth) next.childDateOfBirth = "Child date of birth is required.";
    if (!yearGroup) next.yearGroup = "Select a year group.";
    return next;
  }

  function validateStepThree(): SignupErrors {
    const next: SignupErrors = {};
    if (selectedSubjects.length === 0) next.subjects = "Select at least one subject bundle.";
    if (!learningFocus) next.focus = "Select a learning focus.";
    return next;
  }

  function validateStepFour(): SignupErrors {
    const next: SignupErrors = {};
    if (!guardianConsent) next.guardianConsent = "Guardian confirmation is required.";
    if (!learningProfileConsent) next.learningProfileConsent = "Learning profile consent is required.";
    if (!termsConsent) next.termsConsent = "Terms and Privacy agreement is required.";
    return next;
  }

  function goNextStep() {
    const nextErrors = step === 1 ? validateStepOne() : step === 2 ? validateStepTwo() : validateStepThree();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setToast({ type: "error", message: "Please fix the highlighted fields." });
      return;
    }

    setErrors({});
    setStep((current) => (current === 1 ? 2 : current === 2 ? 3 : 4));
  }

  function goPrevStep() {
    setErrors({});
    setStep((current) => (current === 4 ? 3 : current === 3 ? 2 : 1));
  }

  function toggleSubject(subject: string) {
    setSelectedSubjects((current) => {
      if (current.includes(subject)) {
        return current.filter((item) => item !== subject);
      }
      return [...current, subject];
    });
  }

  function generatePassword() {
    const generated = generateSecurePassword();
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
    setShowConfirmPassword(true);
    setErrors((current) => ({ ...current, password: undefined, confirmPassword: undefined }));
    setToast({ type: "success", message: "Strong password generated." });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      ...validateStepOne(),
      ...validateStepTwo(),
      ...validateStepThree(),
      ...validateStepFour(),
    };

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setToast({ type: "error", message: "Please complete all required fields." });
      if (nextErrors.parentName || nextErrors.email || nextErrors.phone || nextErrors.password || nextErrors.confirmPassword) {
        setStep(1);
      } else if (nextErrors.childName || nextErrors.childDateOfBirth || nextErrors.yearGroup) {
        setStep(2);
      } else if (nextErrors.subjects || nextErrors.focus) {
        setStep(3);
      } else {
        setStep(4);
      }
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parentName,
          email,
          phone,
          address: {
            addressLine1,
            addressLine2,
            townCity,
            county,
            postcode,
            country,
          },
          password,
          marketingOptIn,
          child: {
            name: childName,
            dateOfBirth: childDateOfBirth,
            age: calculatedAge ?? undefined,
            yearGroup,
            stage,
            selectedSubjects,
            learningFocus,
            learningConfidence,
            mainFocus: mapLearningFocusToLegacyMainFocus(learningFocus),
            avatar,
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrors({ general: payload.error ?? "Unable to create account." });
        setToast({ type: "error", message: payload.error ?? "Could not complete sign up." });
        return;
      }

      setToast({ type: "success", message: "Account created successfully. Redirecting..." });
      router.replace("/consent");
    } catch {
      setErrors({ general: "Unable to create account right now." });
      setToast({ type: "error", message: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <section className="relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_10%_20%,rgba(56,189,248,0.12),transparent),radial-gradient(ellipse_60%_50%_at_90%_85%,rgba(99,102,241,0.16),transparent)]" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.05fr_1fr] lg:items-start">
          <div className="rounded-3xl border border-slate-800/90 bg-slate-900/45 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-4 flex justify-start">
              <Logo variant="wordmark" size={30} animation={false} className="pointer-events-none" />
            </div>
            <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">Create your StarLiz Academy account</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Build a parent account, create your child profile, and set up a stage-aware learning pathway in one guided flow.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-700/70 bg-slate-900/55 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.6)] backdrop-blur-md sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Parent Registration</p>
            <h2 className="mt-2 text-3xl font-black">Create Account</h2>
            <p className="mt-2 text-sm text-slate-400">Complete all four steps to create your account and child learning profile.</p>

            <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:text-sm">
              {[
                { index: 1, title: "Parent Details" },
                { index: 2, title: "Child Profile" },
                { index: 3, title: "Learning Setup" },
                { index: 4, title: "Review & Consent" },
              ].map((item) => {
                const active = step >= item.index;
                return (
                  <div key={item.title} className="rounded-2xl border border-slate-700 bg-slate-950/65 p-3">
                    <p className={`font-bold ${active ? "text-blue-300" : "text-slate-500"}`}>Step {item.index}</p>
                    <p className={`mt-1 font-semibold ${active ? "text-white" : "text-slate-500"}`}>{item.title}</p>
                  </div>
                );
              })}
            </div>

            <form className="mt-6 space-y-5" onSubmit={onSubmit} noValidate>
              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Parent full name</span><input value={parentName} onChange={(e) => setParentName(e.target.value)} className={inputCls} /></label>
                  <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></label>
                  <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Telephone</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></label>
                  <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Address line 1</span><input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className={inputCls} /></label>
                  <label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-300">Address line 2 (optional)</span><input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">Town/City</span><input value={townCity} onChange={(e) => setTownCity(e.target.value)} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">County (optional)</span><input value={county} onChange={(e) => setCounty(e.target.value)} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">Postcode</span><input value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">Country</span><input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">Password</span><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} /></label>
                  <label><span className="text-sm font-semibold text-slate-300">Confirm password</span><input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} /></label>
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold">Show/Hide Password</button>
                    <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold">Show/Hide Confirm</button>
                    <button type="button" onClick={generatePassword} className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200">Generate strong password</button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label><span className="text-sm font-semibold text-slate-300">Child first name</span><input value={childName} onChange={(e) => setChildName(e.target.value)} className={inputCls} /></label>
                    <label><span className="text-sm font-semibold text-slate-300">Child date of birth</span><input type="date" value={childDateOfBirth} onChange={(e) => { setChildDateOfBirth(e.target.value); setYearGroupLockedByParent(false); }} className={inputCls} /></label>
                  </div>

                  <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                    <p>Calculated age: <span className="font-bold text-white">{calculatedAge ?? "-"}</span></p>
                    <p className="mt-1">Suggested UK year group: <span className="font-bold text-white">{suggestedYearGroup ?? "-"}</span></p>
                    <p className="mt-1">Detected stage/key stage: <span className="font-bold text-white">{stage}</span></p>
                    <p className="mt-2 text-xs text-slate-400">We&apos;ve suggested a year group based on date of birth. You can change it if needed.</p>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-300">Year group</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {UK_YEAR_GROUP_OPTIONS.map((option) => (
                        <button key={option} type="button" onClick={() => { setYearGroup(option); setYearGroupLockedByParent(true); }} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${yearGroup === option ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-300">Avatar selection</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {AVATAR_OPTIONS.map((item) => (
                        <button key={item} type="button" onClick={() => setAvatar(item)} className={`rounded-2xl border px-3 py-2 text-2xl ${avatar === item ? "border-blue-500 bg-blue-500/15" : "border-slate-700 bg-slate-950"}`}>{item}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-300">Subject bundles ({stage})</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {stageSubjects.map((subject) => (
                        <button key={subject} type="button" onClick={() => toggleSubject(subject)} className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${selectedSubjects.includes(subject) ? "border-emerald-500 bg-emerald-500/15 text-emerald-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>
                          {subject}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-300">Learning focus</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {visibleFocusOptions.map((option) => (
                        <button key={option.id} type="button" disabled={!option.allowed} onClick={() => setLearningFocus(option.label)} className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${learningFocus === option.label ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-700 bg-slate-950 text-slate-300"} ${option.allowed ? "" : "cursor-not-allowed opacity-50"}`}>
                          {option.label}
                          {!option.allowed ? <span className="block text-xs text-slate-400">Available for KS4 / GCSE only</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-300">Learning confidence</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {LEARNING_CONFIDENCE_OPTIONS.map((option) => (
                        <button key={option} type="button" onClick={() => setLearningConfidence(option)} className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${learningConfidence === option ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-700 bg-slate-950 text-slate-300"}`}>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                    <p className="font-bold text-white">Review summary</p>
                    <p className="mt-2">Parent: {parentName} ({email})</p>
                    <p>Child: {childName}</p>
                    <p>Date of birth: {childDateOfBirth || "-"}</p>
                    <p>Calculated age: {calculatedAge ?? "-"}</p>
                    <p>Year group: {yearGroup}</p>
                    <p>Detected stage: {stage}</p>
                    <p>Selected subjects: {selectedSubjects.join(", ") || "-"}</p>
                    <p>Learning focus: {learningFocus}</p>
                    <p>Confidence: {learningConfidence}</p>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} className="mt-1" />
                    <span>I confirm I am the parent or legal guardian.</span>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input type="checkbox" checked={learningProfileConsent} onChange={(e) => setLearningProfileConsent(e.target.checked)} className="mt-1" />
                    <span>I agree to StarLiz Academy creating a learning profile for my child.</span>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input type="checkbox" checked={termsConsent} onChange={(e) => setTermsConsent(e.target.checked)} className="mt-1" />
                    <span>I agree to the <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">Terms</Link> and <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200">Privacy Policy</Link>.</span>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                    <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} className="mt-1" />
                    <span>Optional: Send me learning tips, progress updates and feature announcements.</span>
                  </label>
                </div>
              )}

              <div className="space-y-1 text-xs font-semibold text-rose-300">
                {Object.values(errors).filter(Boolean).map((error) => <p key={error}>{error}</p>)}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs font-semibold text-slate-500">Progress {completion}%</div>
                <div className="h-2 w-32 rounded-full bg-slate-800"><div className={`h-2 rounded-full bg-linear-to-r from-blue-500 to-indigo-400 transition-all ${progressWidthClass(completion)}`} /></div>
              </div>

              <div className="mt-1 flex flex-wrap gap-3">
                {step > 1 ? <button type="button" onClick={goPrevStep} className="flex-1 rounded-2xl border border-slate-700 px-5 py-3 font-bold text-slate-200 transition hover:bg-slate-800">Back</button> : null}
                {step < 4 ? (
                  <button type="button" onClick={goNextStep} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-bold transition hover:bg-blue-500">Continue</button>
                ) : (
                  <button type="submit" disabled={loading} className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Creating account..." : "Create Account"}</button>
                )}
              </div>

              <p className="text-center text-sm text-slate-400">Already have an account? <Link href="/login" className="font-bold text-blue-300 hover:text-blue-200">Login</Link></p>
            </form>
          </div>
        </div>
      </section>

      {toast ? (
        <div className="fixed right-4 top-20 z-50 max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur transition">
          <p className={`text-sm font-bold ${toast.type === "success" ? "text-emerald-300" : "text-rose-300"}`}>{toast.message}</p>
        </div>
      ) : null}
    </PublicShell>
  );
}
