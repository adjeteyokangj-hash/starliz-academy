"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import CertificateShareControls from "@/components/certificates/CertificateShareControls";

type CertificateLibraryEntry = {
  certificateNumber: string;
  verificationCode: string;
  verificationUrl: string;
  certificateType: "term_completion" | "end_of_term_exam" | "subject_achievement" | "english_achievement" | "mastery_certificate" | "award_certificate";
  typeLabel: string;
  typeGroupLabel: string;
  title: string;
  awardType: string | null;
  awardScope: string | null;
  subject: string | null;
  strand: string | null;
  yearGroup: string | null;
  keyStage: string | null;
  term: string;
  issuedAt: string;
  status: "issued" | "revoked";
};

type StudentCertificatesPayload = {
  ok?: boolean;
  student?: {
    id: string;
    name: string;
    studentDisplayName: string;
    yearGroup: string | null;
    keyStage: string | null;
  };
  certificates?: CertificateLibraryEntry[];
  error?: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(status: "issued" | "revoked"): string {
  return status === "revoked"
    ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-rose-700"
    : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-700";
}

function safeDisplayName(name: string): string {
  const clean = String(name || "").trim();
  if (!clean) return "Learner";
  const [first] = clean.split(/\s+/g);
  if (!first) return "Learner";
  if (first.length <= 1) return `${first}*`;
  return `${first.charAt(0)}${"*".repeat(Math.max(1, first.length - 1))}`;
}

export default function StudentCertificatesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Learner");
  const [certificates, setCertificates] = useState<CertificateLibraryEntry[]>([]);
  const [previewByCertificate, setPreviewByCertificate] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadCertificates() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/student/certificates", { credentials: "include" });
        if (response.status === 401) {
          if (!cancelled) router.replace("/auth/login");
          return;
        }
        const payload = (await response.json().catch(() => null)) as StudentCertificatesPayload | null;
        if (!response.ok || !payload?.ok) {
          if (!cancelled) {
            setError(payload?.error ?? "Unable to load certificates right now.");
          }
          return;
        }
        if (!cancelled) {
          setStudentName(payload.student?.name ?? payload.student?.studentDisplayName ?? "Learner");
          setCertificates(payload.certificates ?? []);
        }
      } catch {
        if (!cancelled) setError("Unable to load certificates right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCertificates();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, CertificateLibraryEntry[]>();
    for (const row of certificates) {
      const current = byGroup.get(row.typeGroupLabel) ?? [];
      current.push(row);
      byGroup.set(row.typeGroupLabel, current);
    }
    return Array.from(byGroup.entries());
  }, [certificates]);

  const previewStudentName = useMemo(() => safeDisplayName(studentName), [studentName]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">Student area</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">My Certificates</h1>
          <p className="mt-2 text-sm text-slate-600">Issued certificates for {studentName} appear here.</p>
        </section>

        <section className="mt-6 space-y-5">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading certificates...</div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-800">{error}</div>
          ) : null}

          {!loading && !error && certificates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-700">
              Your certificates will appear here after you complete the required learning, exams, or approved awards.
            </div>
          ) : null}

          {!loading && !error && certificates.length > 0 ? grouped.map(([groupLabel, rows]) => (
            <section key={groupLabel} className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">{groupLabel}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {rows.map((row) => (
                  <article key={`${row.verificationCode}-${row.certificateNumber}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                    {(() => {
                      const previewKey = `${row.verificationCode}-${row.certificateNumber}`;
                      const previewOpen = previewByCertificate[previewKey] ?? false;
                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-700">{row.typeLabel}</p>
                        <h3 className="mt-1 text-base font-bold text-slate-900">{row.title}</h3>
                      </div>
                      <span className={statusBadge(row.status)}>{row.status}</span>
                    </div>

                    <div className="mt-3 grid gap-1 text-sm text-slate-700">
                      <p>Certificate number: <span className="font-mono font-semibold text-slate-900">{row.certificateNumber}</span></p>
                      <p>Issued date: <span className="font-semibold text-slate-900">{formatDate(row.issuedAt)}</span></p>
                      <p>Term: <span className="font-semibold text-slate-900">{row.term}</span></p>
                      {row.subject ? <p>Subject: <span className="font-semibold text-slate-900">{row.subject}</span></p> : null}
                      {row.strand ? <p>Strand: <span className="font-semibold text-slate-900">{row.strand}</span></p> : null}
                      {row.awardType ? <p>Award type: <span className="font-semibold text-slate-900">{row.awardType.replaceAll("_", " ")}</span></p> : null}
                      {row.awardScope ? <p>Award scope: <span className="font-semibold text-slate-900">{row.awardScope.replaceAll("_", " ")}</span></p> : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                      <a href={row.verificationUrl} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
                        Verification link
                      </a>
                      {row.status === "issued" ? (
                        <a
                          href={`/api/student/certificates/${encodeURIComponent(row.verificationCode)}/export?store=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                        >
                          Print / Save as PDF
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewByCertificate((prev) => ({
                            ...prev,
                            [previewKey]: !previewOpen,
                          }));
                        }}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                      >
                        {previewOpen ? "Hide certificate preview" : "Preview certificate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/certificates/verify/${encodeURIComponent(row.verificationCode)}`)}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        Open verification page
                      </button>
                    </div>

                    <div className="mt-3 print:hidden">
                      <CertificateShareControls verificationUrl={row.verificationUrl} compact />
                    </div>

                    {previewOpen ? (
                      <div className="mt-4">
                        <CertificatePreview
                          title={row.title}
                          studentDisplayName={previewStudentName}
                          certificateType={row.certificateType}
                          typeLabel={row.typeLabel}
                          yearGroup={row.yearGroup}
                          keyStage={row.keyStage}
                          term={row.term}
                          subject={row.subject}
                          strand={row.strand}
                          awardType={row.awardType}
                          awardScope={row.awardScope}
                          issuedAt={row.issuedAt}
                          certificateNumber={row.certificateNumber}
                          verificationCode={row.verificationCode}
                          verificationUrl={row.verificationUrl}
                          status={row.status}
                          showPrintAction={row.status === "issued"}
                        />
                      </div>
                    ) : null}
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </section>
          )) : null}
        </section>
      </main>
    </div>
  );
}