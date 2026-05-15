"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import type { ChildProfile } from "@/lib/store";

type AuthMePayload = {
  authenticated?: boolean;
  user?: {
    role?: string;
  };
};

type ActiveChildPayload = {
  child: ChildProfile | null;
};

type ShopOwnedItem = {
  id: string;
  name: string;
  category: string;
};

type ShopOwnedPayload = {
  owned?: ShopOwnedItem[];
};

type StudentProfilePreferences = {
  avatar: string;
  theme: ChildProfile["theme"];
  voiceStyle: ChildProfile["settings"]["voiceStyle"];
  coachingStyle: NonNullable<ChildProfile["settings"]["coachingStyle"]>;
  reduceMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
};

const AVATAR_OPTIONS = ["🦊", "🦁", "🐼", "🐯", "🐬", "🦄", "🐨", "🚀"];
const THEME_OPTIONS: Array<{ value: ChildProfile["theme"]; label: string }> = [
  { value: "default", label: "Default" },
  { value: "rainbow", label: "Rainbow" },
  { value: "sunshine", label: "Sunshine" },
  { value: "night-sky", label: "Night Sky" },
  { value: "space", label: "Space" },
  { value: "ocean", label: "Ocean" },
  { value: "jungle", label: "Jungle" },
  { value: "galaxy-pro", label: "Galaxy Pro" },
];

function storageKey(childId: string): string {
  return `starliz:student-profile:${childId}`;
}

function buildInitialPreferences(child: ChildProfile): StudentProfilePreferences {
  return {
    avatar: child.avatar,
    theme: child.theme,
    voiceStyle: child.settings.voiceStyle,
    coachingStyle: child.settings.coachingStyle ?? "balanced",
    reduceMotion: child.settings.reduceMotion,
    largeText: child.settings.largeText,
    highContrast: child.settings.highContrast,
  };
}

export default function StudentProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [badges, setBadges] = useState<ShopOwnedItem[]>([]);
  const [preferences, setPreferences] = useState<StudentProfilePreferences | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const authRes = await fetch("/api/auth/me", { credentials: "include" });
        if (!authRes.ok) {
          router.replace("/login");
          return;
        }

        const authPayload = (await authRes.json()) as AuthMePayload;
        if (authPayload.user?.role !== "student") {
          router.replace(authPayload.user?.role === "admin" ? "/admin" : "/my-profile");
          return;
        }

        const childRes = await fetch("/api/children/active", { credentials: "include" });
        if (!childRes.ok) {
          throw new Error("Unable to load student profile.");
        }

        const childPayload = (await childRes.json()) as ActiveChildPayload;
        if (!active) return;

        if (!childPayload.child) {
          setError("No active learner profile is available.");
          setLoading(false);
          return;
        }

        setChild(childPayload.child);

        const initialPreferences = buildInitialPreferences(childPayload.child);
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(childPayload.child.id)) : null;
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Partial<StudentProfilePreferences>;
            setPreferences({ ...initialPreferences, ...parsed });
          } catch {
            setPreferences(initialPreferences);
          }
        } else {
          setPreferences(initialPreferences);
        }

        const badgesRes = await fetch(`/api/shop/owned?childId=${encodeURIComponent(childPayload.child.id)}`, { credentials: "include" });
        if (badgesRes.ok) {
          const badgesPayload = (await badgesRes.json()) as ShopOwnedPayload;
          if (active) {
            setBadges((badgesPayload.owned ?? []).filter((item) => item.category === "badges"));
          }
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load student profile.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const achievementStats = useMemo(() => {
    if (!child) return [];
    return [
      { label: "Streak", value: `${child.weekStreak} days` },
      { label: "Stars", value: String(child.stars) },
      { label: "XP", value: String(child.xp) },
      { label: "Badges", value: String(badges.length) },
    ];
  }, [badges.length, child]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/auth/login");
  }

  function updatePreferences(update: Partial<StudentProfilePreferences>) {
    setPreferences((current) => {
      if (!current) return current;
      return { ...current, ...update };
    });
    setMessage(null);
  }

  function savePreferences() {
    if (!child || !preferences || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey(child.id), JSON.stringify(preferences));
    setMessage("Student preferences saved on this device.");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,#eff6ff_0%,#f8fafc_45%,#eef2ff_100%)] text-slate-900">
      <Navbar />
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        {loading && <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Loading student profile...</div>}
        {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">{error}</div>}

        {!loading && !error && child && preferences && (
          <>
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-100 via-indigo-100 to-emerald-100 text-4xl shadow-inner">
                    {preferences.avatar}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Student Profile</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{child.name}</h1>
                    <p className="mt-1 text-sm text-slate-600">
                      {child.yearGroup ?? child.schoolYear ?? "Learner profile"}
                      {child.keyStageLevel ? ` · ${child.keyStageLevel}` : ""}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                  {achievementStats.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="mt-1 text-lg font-black text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Learning Preferences</p>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Voice style
                    <select
                      value={preferences.voiceStyle}
                      onChange={(event) => updatePreferences({ voiceStyle: event.target.value as StudentProfilePreferences["voiceStyle"] })}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-900 outline-none"
                    >
                      <option value="warm">Warm</option>
                      <option value="bright">Bright</option>
                      <option value="calm">Calm</option>
                      <option value="playful">Playful</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">
                    Coaching style
                    <select
                      value={preferences.coachingStyle}
                      onChange={(event) => updatePreferences({ coachingStyle: event.target.value as StudentProfilePreferences["coachingStyle"] })}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-900 outline-none"
                    >
                      <option value="gentle">Gentle</option>
                      <option value="balanced">Balanced</option>
                      <option value="stretch">Stretch</option>
                    </select>
                  </label>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Current goals</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(child.learningGoals ?? []).length > 0 ? (
                        (child.learningGoals ?? []).map((goal) => (
                          <span key={goal} className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">{goal}</span>
                        ))
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Adaptive daily practice</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Accessibility</p>
                <div className="mt-4 grid gap-3">
                  {[
                    { key: "reduceMotion", label: "Reduce motion" },
                    { key: "largeText", label: "Large text" },
                    { key: "highContrast", label: "High contrast" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => updatePreferences({ [option.key]: !preferences[option.key as keyof StudentProfilePreferences] } as Partial<StudentProfilePreferences>)}
                      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                    >
                      <span className="font-semibold text-slate-800">{option.label}</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${preferences[option.key as keyof StudentProfilePreferences] ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {preferences[option.key as keyof StudentProfilePreferences] ? "On" : "Off"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Theme & Avatar</p>
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-700">Choose an avatar</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {AVATAR_OPTIONS.map((avatar) => (
                      <button
                        key={avatar}
                        type="button"
                        onClick={() => updatePreferences({ avatar })}
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl ${preferences.avatar === avatar ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5">
                  <p className="text-sm font-semibold text-slate-700">Choose a theme</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {THEME_OPTIONS.map((theme) => (
                      <button
                        key={theme.value}
                        type="button"
                        onClick={() => updatePreferences({ theme: theme.value })}
                        className={`rounded-2xl border px-4 py-3 text-left ${preferences.theme === theme.value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}
                      >
                        <p className="font-bold text-slate-900">{theme.label}</p>
                        <p className="mt-1 text-xs text-slate-500">Applied to this learner profile on this device</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={savePreferences}
                    className="rounded-2xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-500"
                  >
                    Save student preferences
                  </button>
                  {message && <p className="text-sm font-semibold text-emerald-700">{message}</p>}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Achievements & Streaks</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-500">Weekly streak</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">🔥 {child.weekStreak} days</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-500">Unlocked badges</p>
                    {badges.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {badges.slice(0, 6).map((badge) => (
                          <span key={badge.id} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">{badge.name}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">No badges unlocked yet. Keep your streak going.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-rose-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-400">Safe Logout</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-sm text-slate-600">Log out safely when you are finished so the next learner starts from the correct dashboard.</p>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-2xl bg-rose-600 px-5 py-3 font-black text-white hover:bg-rose-500"
                >
                  Log out
                </button>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}