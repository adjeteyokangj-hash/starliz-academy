import { verifyCertificateByVerificationCode } from "@/lib/certificate-records";
import CertificatePreview from "@/components/certificates/CertificatePreview";
import CertificateShareControls from "@/components/certificates/CertificateShareControls";

type VerifyPageProps = {
  params: Promise<{
    verificationCode: string;
  }>;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function VerifyCertificatePage({ params }: VerifyPageProps) {
  const { verificationCode } = await params;
  const verification = await verifyCertificateByVerificationCode(verificationCode);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">StarLiz Academy</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">Certificate Verification</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Verification code: <span className="font-mono text-neutral-800">{verificationCode}</span>
        </p>

        {verification.status === "not_found" || !verification.certificate ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Certificate not found. Please confirm the verification code.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className={`rounded-xl border p-4 text-sm ${verification.status === "valid" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
              {verification.certificate.verificationMessage}
            </div>

            {verification.status === "valid" ? (
              <div className="space-y-2 print:hidden">
                <a
                  href={`/api/certificates/verify/${encodeURIComponent(verification.certificate.verificationCode)}/export?store=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  Print / Save as PDF
                </a>
                <CertificateShareControls
                  verificationUrl={`/certificates/verify/${encodeURIComponent(verification.certificate.verificationCode)}`}
                  compact
                />
              </div>
            ) : null}

            {verification.status === "valid" || verification.status === "revoked" ? (
              <CertificatePreview
                title={verification.certificate.title}
                studentDisplayName={verification.certificate.studentDisplayName}
                certificateType={verification.certificate.certificateType}
                typeLabel={verification.certificate.certificateType.replaceAll("_", " ")}
                yearGroup={verification.certificate.yearGroup}
                keyStage={null}
                term={verification.certificate.term}
                subject={verification.certificate.subject}
                strand={verification.certificate.strand}
                awardType={verification.certificate.awardType}
                awardScope={verification.certificate.awardScope}
                issuedAt={verification.certificate.issuedAt}
                certificateNumber={verification.certificate.certificateNumber}
                verificationCode={verification.certificate.verificationCode}
                verificationUrl={`/certificates/verify/${encodeURIComponent(verification.certificate.verificationCode)}`}
                score={verification.certificate.score}
                status={verification.status}
                showPrintAction={verification.status === "valid"}
              />
            ) : null}

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Certificate Number</dt>
                <dd className="font-medium text-neutral-900">{verification.certificate.certificateNumber}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Certificate Type</dt>
                <dd className="font-medium capitalize text-neutral-900">{verification.certificate.certificateType.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Title</dt>
                <dd className="font-medium text-neutral-900">{verification.certificate.title}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Student</dt>
                <dd className="font-medium text-neutral-900">{verification.certificate.studentDisplayName}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Year Group</dt>
                <dd className="font-medium text-neutral-900">{verification.certificate.yearGroup ?? "Not set"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Term</dt>
                <dd className="font-medium text-neutral-900">{verification.certificate.term}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Issued</dt>
                <dd className="font-medium text-neutral-900">{formatDate(verification.certificate.issuedAt)}</dd>
              </div>
              {verification.certificate.certificateType === "award_certificate" ? (
                <>
                  <div>
                    <dt className="text-neutral-500">Award Type</dt>
                    <dd className="font-medium text-neutral-900">{verification.certificate.awardType?.replaceAll("_", " ") ?? "Award"}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Award Scope</dt>
                    <dd className="font-medium text-neutral-900">{verification.certificate.awardScope?.replaceAll("_", " ") ?? "Scope"}</dd>
                  </div>
                  {verification.certificate.subject ? (
                    <div>
                      <dt className="text-neutral-500">Subject</dt>
                      <dd className="font-medium text-neutral-900">{verification.certificate.subject}</dd>
                    </div>
                  ) : null}
                  {verification.certificate.strand ? (
                    <div>
                      <dt className="text-neutral-500">Strand</dt>
                      <dd className="font-medium text-neutral-900">{verification.certificate.strand.replaceAll("-", " ")}</dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>
          </div>
        )}
      </section>
    </main>
  );
}
