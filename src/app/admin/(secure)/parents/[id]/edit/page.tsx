"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentDetail = {
  id: string;
  name: string | null;
  email: string;
  parentProfile: {
    phone: string;
    whatsappNumber: string | null;
    address: string | null;
    country: string | null;
    timezone: string | null;
    parentRole: string | null;
    status: string;
    emailVerified: boolean;
    smsConsent: boolean;
    whatsappConsent: boolean;
    emailConsent: boolean;
    numberOfChildren: number | null;
    preferredLearningFocus: string | null;
    schoolType: string | null;
    curriculum: string | null;
    trialStatus: string | null;
    subscriptionPlan: string | null;
    stripeCustomerId: string | null;
    paystackCustomerId: string | null;
    forcePasswordReset: boolean;
    mfaEnabled: boolean;
    lastLoginAt: string | null;
    deviceTrackingJson: string | null;
  } | null;
};

export default function EditParentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [parent, setParent] = useState<ParentDetail | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [parentRole, setParentRole] = useState("parent");
  const [status, setStatus] = useState("active");
  const [emailVerified, setEmailVerified] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [numberOfChildren, setNumberOfChildren] = useState("");
  const [preferredLearningFocus, setPreferredLearningFocus] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [trialStatus, setTrialStatus] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [stripeCustomerId, setStripeCustomerId] = useState("");
  const [paystackCustomerId, setPaystackCustomerId] = useState("");
  const [forcePasswordReset, setForcePasswordReset] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [lastLoginAt, setLastLoginAt] = useState("");
  const [deviceTrackingJson, setDeviceTrackingJson] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/parents/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        if (!payload) return;
        if (payload.parent) {
          setParent(payload.parent);
          setName(payload.parent.name ?? "");
          setEmail(payload.parent.email);
          setPhone(payload.parent.parentProfile?.phone ?? "");
          setWhatsappNumber(payload.parent.parentProfile?.whatsappNumber ?? "");
          setAddress(payload.parent.parentProfile?.address ?? "");
          setCountry(payload.parent.parentProfile?.country ?? "");
          setTimezone(payload.parent.parentProfile?.timezone ?? "");
          setParentRole(payload.parent.parentProfile?.parentRole ?? "parent");
          setStatus(payload.parent.parentProfile?.status ?? "active");
          setEmailVerified(Boolean(payload.parent.parentProfile?.emailVerified));
          setSmsConsent(Boolean(payload.parent.parentProfile?.smsConsent));
          setWhatsappConsent(Boolean(payload.parent.parentProfile?.whatsappConsent));
          setEmailConsent(Boolean(payload.parent.parentProfile?.emailConsent));
          setNumberOfChildren(payload.parent.parentProfile?.numberOfChildren != null ? String(payload.parent.parentProfile.numberOfChildren) : "");
          setPreferredLearningFocus(payload.parent.parentProfile?.preferredLearningFocus ?? "");
          setSchoolType(payload.parent.parentProfile?.schoolType ?? "");
          setCurriculum(payload.parent.parentProfile?.curriculum ?? "");
          setTrialStatus(payload.parent.parentProfile?.trialStatus ?? "");
          setSubscriptionPlan(payload.parent.parentProfile?.subscriptionPlan ?? "");
          setStripeCustomerId(payload.parent.parentProfile?.stripeCustomerId ?? "");
          setPaystackCustomerId(payload.parent.parentProfile?.paystackCustomerId ?? "");
          setForcePasswordReset(Boolean(payload.parent.parentProfile?.forcePasswordReset));
          setMfaEnabled(Boolean(payload.parent.parentProfile?.mfaEnabled));
          setLastLoginAt(payload.parent.parentProfile?.lastLoginAt ? payload.parent.parentProfile.lastLoginAt.slice(0, 16) : "");
          setDeviceTrackingJson(payload.parent.parentProfile?.deviceTrackingJson ?? "");
        }
      });
  }, [params.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch(`/api/admin/parents/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        whatsappNumber: whatsappNumber || null,
        address: address || null,
        country: country || null,
        timezone: timezone || null,
        parentRole: parentRole || null,
        status,
        emailVerified,
        smsConsent,
        whatsappConsent,
        emailConsent,
        numberOfChildren: numberOfChildren ? Number(numberOfChildren) : null,
        preferredLearningFocus: preferredLearningFocus || null,
        schoolType: schoolType || null,
        curriculum: curriculum || null,
        trialStatus: trialStatus || null,
        subscriptionPlan: subscriptionPlan || null,
        stripeCustomerId: stripeCustomerId || null,
        paystackCustomerId: paystackCustomerId || null,
        forcePasswordReset,
        mfaEnabled,
        lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : null,
        deviceTrackingJson: deviceTrackingJson || null,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Unable to update parent.");
      return;
    }
    router.replace(`/admin/parents/${params.id}`);
  }

  if (!parent) {
    return <AdminSectionCard title="Edit Parent"><p className="text-sm text-slate-400">Loading parent...</p></AdminSectionCard>;
  }

  return (
    <AdminSectionCard title="Edit Parent" eyebrow="Accounts">
      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <label className="block text-sm font-bold text-slate-300">
          Parent name
          <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            WhatsApp
            <input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <label className="block text-sm font-bold text-slate-300">
          Address
          <input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-bold text-slate-300">
            Country
            <input value={country} onChange={(event) => setCountry(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Timezone
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Parent role
            <input value={parentRole} onChange={(event) => setParentRole(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Number of children
            <input type="number" min={0} value={numberOfChildren} onChange={(event) => setNumberOfChildren(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <label className="block text-sm font-bold text-slate-300">
          Preferred learning focus
          <input value={preferredLearningFocus} onChange={(event) => setPreferredLearningFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            School type
            <input value={schoolType} onChange={(event) => setSchoolType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Curriculum
            <input value={curriculum} onChange={(event) => setCurriculum(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Trial status
            <input value={trialStatus} onChange={(event) => setTrialStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Subscription plan
            <input value={subscriptionPlan} onChange={(event) => setSubscriptionPlan(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold text-slate-300">
            Stripe customer ID
            <input value={stripeCustomerId} onChange={(event) => setStripeCustomerId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-bold text-slate-300">
            Paystack customer ID
            <input value={paystackCustomerId} onChange={(event) => setPaystackCustomerId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
          </label>
        </div>
        <label className="block text-sm font-bold text-slate-300">
          Last login
          <input type="datetime-local" value={lastLoginAt} onChange={(event) => setLastLoginAt(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <label className="block text-sm font-bold text-slate-300">
          Device tracking JSON
          <textarea value={deviceTrackingJson} onChange={(event) => setDeviceTrackingJson(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        </label>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={emailVerified} onChange={(event) => setEmailVerified(event.target.checked)} />Email verified</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={emailConsent} onChange={(event) => setEmailConsent(event.target.checked)} />Email consent</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} />SMS consent</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={whatsappConsent} onChange={(event) => setWhatsappConsent(event.target.checked)} />WhatsApp consent</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={forcePasswordReset} onChange={(event) => setForcePasswordReset(event.target.checked)} />Force password reset</label>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={mfaEnabled} onChange={(event) => setMfaEnabled(event.target.checked)} />MFA enabled</label>
        </div>
        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        <button className="rounded-xl bg-indigo-500 px-4 py-3 font-black text-white hover:bg-indigo-400">Save Parent</button>
      </form>
    </AdminSectionCard>
  );
}

