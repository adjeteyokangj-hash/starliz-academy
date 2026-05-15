"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminSectionCard from "@/components/admin/AdminSectionCard";

type ParentDetail = {
  id: string;
  name: string | null;
  email: string;
  activeChildId: string | null;
  createdAt: string;
  updatedAt: string;
  parentProfile: {
    phone: string;
    whatsappNumber: string | null;
    address: string | null;
    country: string | null;
    timezone: string | null;
    status: string;
    trialStatus: string | null;
    subscriptionPlan: string | null;
    stripeCustomerId: string | null;
    paystackCustomerId: string | null;
    mfaEnabled: boolean;
  } | null;
  subscription: {
    id: string;
    status: string;
    planKey: string;
    currentPeriodEnd: string | null;
    updatedAt: string;
  } | null;
  consentVersion: string | null;
  consentAcceptedAt: string | null;
  consentWithdrawnAt: string | null;
  notificationPreferences: Array<{ eventType: string | null; emailEnabled: boolean; updatedAt: string }>;
  auditTrail: Array<{ id: string; action: string; entityType: string; metadataJson: string | null; createdAt: string }>;
  children: { id: string; name: string; age: number | null; yearGroup: string | null; level: number; stars: number; xp: number; streak: number; updatedAt: string }[];
};

export default function ParentDetailPage() {
  const params = useParams<{ id: string }>();
  const [parent, setParent] = useState<ParentDetail | null>(null);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordMessage, setResetPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/parents/${params.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => { if (payload) setParent(payload.parent ?? null); });
  }, [params.id]);

  async function handleResetPassword() {
    if (!parent) return;
    setResetPasswordLoading(true);
    setResetPasswordMessage(null);
    try {
      const response = await fetch(`/api/admin/parents/${parent.id}/reset-password`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setResetPasswordMessage({
          type: "error",
          text: payload.error ?? "Failed to send password reset email",
        });
      } else {
        setResetPasswordMessage({
          type: "success",
          text: payload.message ?? "Password reset email sent successfully",
        });
      }
    } catch {
      setResetPasswordMessage({
        type: "error",
        text: "An error occurred. Please try again.",
      });
    } finally {
      setResetPasswordLoading(false);
    }
  }

  if (!parent) {
    return <AdminSectionCard title="Parent Profile"><p className="text-sm text-slate-400">Loading parent...</p></AdminSectionCard>;
  }

  return (
    <div className="space-y-6">
      <AdminSectionCard
        title={parent.name ?? "Parent"}
        eyebrow="Parent profile"
        action={<div className="flex gap-2"><Link href={`/admin/parents/${parent.id}/edit`} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">Edit Parent</Link><button onClick={handleResetPassword} disabled={resetPasswordLoading} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50">{resetPasswordLoading ? "Sending..." : "Reset Password"}</button></div>}
      >
        {resetPasswordMessage && (
          <div className={`rounded-xl border px-4 py-3 mb-4 text-sm ${
            resetPasswordMessage.type === "success"
              ? "border-green-500/50 bg-green-500/10 text-green-300"
              : "border-red-500/50 bg-red-500/10 text-red-300"
          }`}>
            {resetPasswordMessage.text}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Email</p>
            <p className="mt-2 font-bold text-white">{parent.email}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Linked children</p>
            <p className="mt-2 text-2xl font-black text-white">{parent.children.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Account rule</p>
            <p className="mt-2 font-bold text-white">{parent.parentProfile?.status ?? "active"}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Phone</p>
            <p className="mt-2 text-sm text-white">{parent.parentProfile?.phone ?? "Not set"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">WhatsApp</p>
            <p className="mt-2 text-sm text-white">{parent.parentProfile?.whatsappNumber ?? "Not set"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Plan</p>
            <p className="mt-2 text-sm text-white">{parent.subscription?.planKey ?? parent.parentProfile?.subscriptionPlan ?? "None"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">MFA</p>
            <p className="mt-2 text-sm text-white">{parent.parentProfile?.mfaEnabled ? "Enabled" : "Disabled"}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Subscription status</p>
            <p className="mt-2 text-sm text-white">{parent.subscription?.status ?? "free"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Consent status</p>
            <p className="mt-2 text-sm text-white">{parent.consentAcceptedAt ? "Accepted" : "Pending"}</p>
          </div>
          <div className="rounded-2xl bg-slate-950/45 p-4">
            <p className="text-xs uppercase text-slate-500">Consent version</p>
            <p className="mt-2 text-sm text-white">{parent.consentVersion ?? "Not set"}</p>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Notification Preferences">
        {parent.notificationPreferences.length === 0 ? (
          <p className="text-sm text-slate-400">No saved parent notification preferences.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {parent.notificationPreferences.map((pref) => (
              <article key={`${pref.eventType}-${pref.updatedAt}`} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-white">{pref.eventType ?? 'default'}</p>
                <p className="mt-1 text-xs text-slate-400">Email: {pref.emailEnabled ? 'enabled' : 'disabled'}</p>
                <p className="mt-1 text-xs text-slate-500">Updated: {new Date(pref.updatedAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="Consent & Security History">
        {parent.auditTrail.length === 0 ? (
          <p className="text-sm text-slate-400">No consent/security audit events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {parent.auditTrail.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-white">{event.action}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        title="Linked Children"
        action={<Link href={`/admin/students/new?parentId=${parent.id}`} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-bold text-white">Add Student</Link>}
      >
        {parent.children.length === 0 ? (
          <AdminEmptyState
            title="No linked children"
            description="Every student must belong to a parent account. Add the first child for this parent."
            actionLabel="Add Student"
            href={`/admin/students/new?parentId=${parent.id}`}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {parent.children.map((child) => (
              <Link key={child.id} href={`/admin/students/${child.id}`} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 hover:border-indigo-500">
                <p className="font-black text-white">{child.name}</p>
                <p className="mt-1 text-sm text-slate-400">Level {child.level} · {child.stars} stars · {child.xp} XP</p>
              </Link>
            ))}
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}
