"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ChildProfile, getProfiles, hydrateProfilesFromServer, setActiveProfileId } from "@/lib/store";

const EMPTY_PROFILES: ChildProfile[] = [];

function subscribeProfiles(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener("starliz-profile-changed", handler);
  return () => {
    window.removeEventListener("starliz-profile-changed", handler);
  };
}

function getProfilesSnapshot(): ChildProfile[] {
  return getProfiles();
}

function getServerProfilesSnapshot(): ChildProfile[] {
  return EMPTY_PROFILES;
}

export default function ProfilesClient() {
  const router = useRouter();
  const profiles = useSyncExternalStore(subscribeProfiles, getProfilesSnapshot, getServerProfilesSnapshot);

  useEffect(() => {
    void hydrateProfilesFromServer();
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card title="Who is learning today?">
          <p className="text-sm text-slate-600">
            Children start here by tapping their own profile. Parent Area is only needed to add, edit, or manage profiles.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => {
                  setActiveProfileId(p.id);
                  router.push(p.lastPage ?? "/dashboard");
                }}
              >
                <p className="text-5xl leading-none">{p.avatar}</p>
                <p className="mt-3 text-xl font-black text-slate-900">{p.name}</p>
                <p className="text-sm font-semibold text-slate-500">Age {p.ageYears ?? (p.ageRange === "5-7" ? 6 : 9)}</p>
                <span className="mt-4 inline-flex rounded-2xl px-5 py-3 font-bold text-white shadow-[0_14px_32px_rgba(108,92,231,0.25)] transition" style={{ backgroundImage: "var(--btn-primary)" }}>
                  Continue as {p.name}
                </span>
              </button>
            ))}
          </div>
          {!profiles.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              <p>No child profiles yet.</p>
              <p className="mt-1">A parent must add a child profile first. After that, the child can tap their name here and start learning.</p>
            </div>
          ) : null}
          <div className="mt-6 flex gap-3">
            <Link href="/parent-pin">
              <Button variant="accent">{profiles.length ? "Add another child" : "Parent: add child profile"}</Button>
            </Link>
            <Link href="/parent-pin"><Button variant="secondary">Parent Area 🔒</Button></Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
