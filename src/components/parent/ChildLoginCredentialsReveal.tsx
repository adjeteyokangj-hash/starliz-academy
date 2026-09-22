"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

export type OneTimeChildCredentials = {
  username: string;
  password: string;
};

type Props = {
  childName: string;
  credentials: OneTimeChildCredentials;
  onDismiss: () => void;
};

export default function ChildLoginCredentialsReveal({ childName, credentials, onDismiss }: Props) {
  const [copiedField, setCopiedField] = useState<"username" | "password" | "both" | null>(null);

  async function copyText(label: "username" | "password" | "both", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField(null);
    }
  }

  function handlePrint() {
    window.print();
  }

  const both = `Username: ${credentials.username}\nPassword: ${credentials.password}`;

  return (
    <div
      className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-5 print:border print:border-black print:bg-white print:text-black"
      role="status"
      aria-live="polite"
    >
      <h3 className="text-lg font-bold text-amber-100 print:text-black">Save {childName}&apos;s login now</h3>
      <p className="mt-2 text-sm text-amber-50/90 print:text-black">
        These credentials are shown once. The password is not stored in plain text, so it cannot be displayed again later.
        Write them down or copy them before closing this panel.
      </p>

      <dl className="mt-4 space-y-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 print:border-black print:bg-white">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 print:text-black">Username</dt>
          <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <code className="text-base font-semibold text-white print:text-black">{credentials.username}</code>
            <Button
              type="button"
              className="bg-slate-800 hover:bg-slate-700 print:hidden"
              onClick={() => void copyText("username", credentials.username)}
            >
              {copiedField === "username" ? "Copied" : "Copy"}
            </Button>
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 print:border-black print:bg-white">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 print:text-black">Password</dt>
          <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <code className="text-base font-semibold text-white print:text-black">{credentials.password}</code>
            <Button
              type="button"
              className="bg-slate-800 hover:bg-slate-700 print:hidden"
              onClick={() => void copyText("password", credentials.password)}
            >
              {copiedField === "password" ? "Copied" : "Copy"}
            </Button>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row print:hidden">
        <Button type="button" onClick={() => void copyText("both", both)}>
          {copiedField === "both" ? "Copied both" : "Copy username + password"}
        </Button>
        <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={handlePrint}>
          Print / save
        </Button>
        <Button type="button" className="bg-slate-800 hover:bg-slate-700" onClick={onDismiss}>
          I&apos;ve saved these credentials
        </Button>
      </div>
    </div>
  );
}
