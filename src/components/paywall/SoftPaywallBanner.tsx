"use client";
import { useRouter } from "next/navigation";

export default function SoftPaywallBanner({ sessionsLeft }: { sessionsLeft: number }) {
  const router = useRouter();
  if (sessionsLeft > 2) return null;

  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="text-sm text-amber-800">
        {sessionsLeft === 2 ? "You have 2 free sessions left." : null}
        {sessionsLeft === 1 ? "Last free session remaining." : null}
      </div>

      <button
        onClick={() => router.push("/pricing")}
        className="ml-4 rounded-lg bg-indigo-600 px-3 py-1 text-sm text-white"
      >
        Upgrade
      </button>
    </div>
  );
}
