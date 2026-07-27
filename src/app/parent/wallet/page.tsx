"use client";

import Link from "next/link";
import Navbar from "@/components/layout/Navbar";

/**
 * Standalone wallet UI disabled for Parent Portal launch.
 * Client-store profile selection is not authoritative for balances.
 * Use Parent Portal → Rewards (server child data) instead.
 */
export default function ParentWalletPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-3xl font-black">Wallet unavailable</h1>
        <p className="mt-4 text-slate-300">
          The standalone wallet page is disabled for launch. Reward balances are shown in the Parent Portal
          Rewards section using server-authoritative child data only. Wallet top-ups and client-fabricated
          balances are not available.
        </p>
        <Link href="/parent/rewards" className="mt-6 inline-block text-cyan-300 hover:underline">
          ← Back to Parent Portal Rewards
        </Link>
      </div>
    </div>
  );
}
