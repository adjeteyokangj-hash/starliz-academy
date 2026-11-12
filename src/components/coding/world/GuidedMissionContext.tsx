"use client";
import Link from "next/link";
import { locations, type LocationId } from "@/lib/coding/world/model";
export default function GuidedMissionContext({ location, objective, stage }: { location: LocationId; objective: string; stage: string }) {
  const place = locations.find(place => place.id === location)!;
  return <section aria-label="Guided world mission" className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 text-emerald-950"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{place.icon} Guided mission · {place.title}</h2><Link href="/student/coding/world" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 bg-white px-4 font-bold">Explore Free Practice</Link></div><p className="mt-2 text-sm">{place.character}: {place.story}</p><p className="mt-3 font-semibold">{objective}</p><p className="mt-2 text-sm">Current learning stage: {stage}. Your teacher assignment, prerequisites, saved work and mastery checks come from your existing Coding lesson. Practice stars do not complete this mission.</p></section>;
}
