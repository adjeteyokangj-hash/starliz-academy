"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function generatePassword() {
    const lowercase = "abcdefghijkmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const symbols = "!@#$%&*?";
    const groups = [lowercase, uppercase, digits, symbols];
    const allChars = groups.join("");
    const bytes = new Uint32Array(18);
    crypto.getRandomValues(bytes);

    const required = groups.map((group, index) => group[bytes[index] % group.length]);
    const remaining = Array.from(bytes.slice(groups.length), (byte) => allChars[byte % allChars.length]);
    const shuffled = [...required, ...remaining].sort(() => crypto.getRandomValues(new Uint32Array(1))[0] - 2147483648);

    setPassword(shuffled.join(""));
    setShowPassword(true);
    setPasswordMessage("Strong password generated.");
  }

  async function copyPassword() {
    if (!password) {
      setPasswordMessage("Generate or enter a password first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(password);
      setPasswordMessage("Password copied.");
    } catch {
      setPasswordMessage("Could not copy password.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Sign up failed.");
        return;
      }
      router.replace("/consent");
    } catch {
      setError("Unable to sign up right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-4 sm:py-10">
      <section className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white/90 p-6 sm:p-8 shadow-xl ring-1 ring-slate-200">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">StarLiz Academy</p>
        <h1 className="mt-2 font-heading text-3xl sm:text-4xl font-black text-slate-900">Create Parent Account</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-600">Create your secure account to manage multiple children and saved progress.</p>

        <form className="mt-6 space-y-3 sm:space-y-4" onSubmit={onSubmit}>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Parent name
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs sm:text-sm font-semibold text-slate-700">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700" htmlFor="signup-password">
              Password
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordMessage(null);
                }}
                className="min-w-0 flex-1 rounded-lg sm:rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="rounded-lg sm:rounded-xl border border-slate-300 bg-white px-2 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg sm:rounded-xl bg-secondary px-3 py-2 text-xs sm:text-sm font-bold text-white"
                onClick={generatePassword}
              >
                Generate password
              </button>
              <button
                type="button"
                className="rounded-lg sm:rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-700"
                onClick={() => void copyPassword()}
              >
                Copy
              </button>
            </div>
            {passwordMessage ? <p className="mt-2 text-xs sm:text-sm font-semibold text-slate-600">{passwordMessage}</p> : null}
          </div>

          {error ? <p className="text-xs sm:text-sm font-semibold text-rose-700">{error}</p> : null}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="mt-4 text-xs sm:text-sm text-slate-600">
          Already have an account? <Link href="/auth/login" className="font-bold text-primary">Login</Link>
        </p>
      </section>
    </main>
  );
}
