"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";

type AccountPayload = {
  account: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    linkedChildrenCount: number;
    subscriptionStatus: string;
    subscriptionPlanKey: string;
    subscriptionProvider: string;
    childLimit: number;
    renewalDate: string | null;
  };
  activeChild: { id: string; name: string; avatar: string | null } | null;
  notifications: {
    emailWeeklyReport: boolean;
    assignmentAlerts: boolean;
    productUpdates: boolean;
  };
};

const section = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "white",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
  ...extra,
});

const sectionTitle = (label: string) => (
  <p style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 16px" }}>{label}</p>
);

export default function MyProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<AccountPayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [notifications, setNotifications] = useState({
    emailWeeklyReport: true,
    assignmentAlerts: true,
    productUpdates: false,
  });

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/account", { credentials: "include" });
      if (!res.ok) { setError("Unable to load account profile."); setLoading(false); return; }
      const payload = (await res.json()) as AccountPayload;
      if (payload.account.role === "student") {
        router.replace("/student/profile");
        return;
      }
      setData(payload);
      setDisplayName(payload.account.name);
      setNotifications(payload.notifications);
      setLoading(false);
    };
    void load();
  }, [router]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: displayName, notifications }),
      });
      if (!res.ok) { setError("Could not save account settings."); return; }
      if (data) setData({ ...data, account: { ...data.account, name: displayName }, notifications });
      setMessage("Settings saved.");
      setEditingName(false);
    } catch { setError("Could not save account settings."); }
    finally { setSaving(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/auth/login");
  }

  if (loading) return <main className="min-h-screen" style={{ background: "linear-gradient(160deg,#f8f4ff 0%,#f0fdf4 100%)" }} />;

  if (!data) {
    return (
      <main className="min-h-screen" style={{ background: "linear-gradient(160deg,#f8f4ff 0%,#f0fdf4 100%)" }}>
        <Navbar />
        <div className="mx-auto max-w-xl px-4 py-12">
          <div style={section()}>
            <p style={{ color: "#dc2626", fontSize: 14 }}>{error ?? "Unable to load profile."}</p>
          </div>
        </div>
      </main>
    );
  }

  const initials = data.account.name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "P";

  return (
    <main className="min-h-screen" style={{ background: "linear-gradient(160deg,#f8f4ff 0%,#f0fdf4 100%)" }}>
      <Navbar />
      <div className="mx-auto max-w-xl px-4 py-8" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── ACCOUNT HEADER ── */}
        <div style={{ background: "linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%)", borderRadius: 24, padding: 28, boxShadow: "0 8px 32px rgba(124,58,237,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "white", flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              {editingName ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 10, padding: "6px 12px", fontSize: 18, fontWeight: 700, color: "white", width: "100%", outline: "none" }}
                  autoFocus
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0 }}>{data.account.name}</p>
                  <button onClick={() => setEditingName(true)} style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                </div>
              )}
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, margin: "4px 0 0" }}>{data.account.email}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ background: "rgba(255,255,255,0.15)", color: "white", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                  {data.account.subscriptionStatus}
                </span>
                <span style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>
                  {data.account.linkedChildrenCount}/{data.account.childLimit} children
                </span>
                <span style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>
                  {data.account.subscriptionProvider.toUpperCase()}
                </span>
              </div>
              <Link href="/subscription" style={{ marginTop: 10, display: "inline-block", background: "rgba(255,255,255,0.2)", color: "white", borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                Manage plan
              </Link>
            </div>
          </div>
        </div>

        {/* ── ACTIVE CHILD SHORTCUT ── */}
        {data.activeChild ? (
          <div style={section({ border: "1px solid #ede9fe" })}>
            {sectionTitle("Active Learner")}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg,#ede9fe,#ddd6fe)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
                  {data.activeChild.avatar ?? "🦊"}
                </div>
                <div>
                  <p style={{ fontWeight: 800, color: "#1e1b4b", fontSize: 16, margin: 0 }}>{data.activeChild.name}</p>
                  <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Active</span>
                </div>
              </div>
              <Link href="/profiles" style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Switch Learner
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ ...section(), textAlign: "center" }}>
            {sectionTitle("Active Learner")}
            <p style={{ color: "#64748b", fontSize: 14 }}>No active child selected.</p>
            <Link href="/profiles" style={{ display: "inline-block", marginTop: 8, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", borderRadius: 12, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              Select a Learner
            </Link>
          </div>
        )}

        {/* ── PROFILE SETTINGS ── */}
        <div style={section()}>
          {sectionTitle("Profile Settings")}
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151" }}>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ marginTop: 6, display: "block", width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 14, boxSizing: "border-box", outline: "none" }}
            />
          </label>
          {error ? <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p> : null}
          {message ? <p style={{ color: "#059669", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{message}</p> : null}
          <button
            onClick={() => void saveSettings()}
            disabled={saving}
            style={{ marginTop: 14, background: saving ? "#9ca3af" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 700, border: "none", cursor: saving ? "not-allowed" : "pointer" }}
          >{saving ? "Saving..." : "Save"}</button>
        </div>

        {/* ── NOTIFICATIONS ── */}
        <div style={section()}>
          {sectionTitle("Notifications")}
          <div style={{ display: "grid", gap: 14 }}>
            {[
              { key: "emailWeeklyReport" as const, label: "Weekly report emails", desc: "Receive a weekly summary of your child's progress." },
              { key: "assignmentAlerts" as const, label: "Assignment alerts", desc: "Get notified when new tasks are assigned." },
              { key: "productUpdates" as const, label: "Product updates", desc: "News about new features and improvements." },
            ].map(({ key, label, desc }) => (
              <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer" }}>
                <div
                  onClick={() => setNotifications((n) => ({ ...n, [key]: !n[key] }))}
                  style={{ width: 44, height: 26, borderRadius: 99, background: notifications[key] ? "#7c3aed" : "#e5e7eb", position: "relative", flexShrink: 0, cursor: "pointer", transition: "background 0.2s", marginTop: 2 }}
                >
                  <div style={{ position: "absolute", top: 3, left: notifications[key] ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>{desc}</p>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={() => void saveSettings()}
            disabled={saving}
            style={{ marginTop: 18, background: saving ? "#9ca3af" : "#f1f5f9", color: "#374151", borderRadius: 12, padding: "10px 24px", fontSize: 14, fontWeight: 700, border: "1px solid #e2e8f0", cursor: saving ? "not-allowed" : "pointer" }}
          >{saving ? "Saving..." : "Save preferences"}</button>
        </div>

        {/* ── SECURITY ── */}
        <div style={section()}>
          {sectionTitle("Security")}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>Password</p>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>Use a strong, unique password.</p>
            </div>
            <Link
              href="/forgot-password"
              style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "9px 16px", fontSize: 13, fontWeight: 700, border: "1px solid #fde68a", cursor: "pointer" }}
            >Reset Password</Link>
          </div>
        </div>

        {/* ── ACCOUNT ACTIONS ── */}
        <div style={section()}>
          {sectionTitle("Account Actions")}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => void logout()}
              style={{ background: "#fff1f2", color: "#be123c", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 700, border: "1px solid #fecdd3", cursor: "pointer", textAlign: "left" }}
            >🚪 Log out</button>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Account created {new Date(data.account.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

      </div>
    </main>
  );
}
