/**
 * Dry-run-first remediation for Short Learning bookings with incorrect UTC instants.
 *
 * DEFAULT: preview only. Does NOT write unless --apply is passed.
 *
 * Requires explicit booking IDs AND an explicit intended London wall-clock:
 *   --ids=id1,id2 --intended-hm=17:30
 * Optional per-id override file is not supported; one intended hm applies to the batch
 * (use separate runs for different intended times).
 *
 * Corrected UTC is computed via Europe/London (BST/GMT aware).
 * Never applies a blind ±1 hour.
 *
 * Usage:
 *   npx tsx scripts/uat/remediate-short-learning-utc-wallclock.ts --ids=ID --intended-hm=17:30
 *   npx tsx scripts/uat/remediate-short-learning-utc-wallclock.ts --ids=ID --intended-hm=17:30 --apply
 */
import "./load-env";
import { PrismaClient } from "@prisma/client";
import {
  formatUkDateIso,
  formatUkDateTime,
  formatUkTime,
  getUkParts,
  londonInstantFromDateAndHm,
} from "../../src/lib/uk-datetime";

const prisma = new PrismaClient();

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return process.argv.includes(`--${name}`) ? "true" : null;
}

function parseIds(): string[] {
  const raw = arg("ids");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

type PlanRow = {
  bookingId: string;
  studentName: string;
  status: string;
  currentStoredInstant: string;
  currentUkDisplay: string;
  currentUkHm: string;
  intendedLondonHm: string;
  proposedCorrectedUtc: string;
  proposedUkDisplay: string;
  offsetLabel: "BST" | "GMT" | "OTHER";
  journeyId: string | null;
  journeyStatus: string | null;
  sessionId: string | null;
  sessionStatus: string | null;
  alreadyConsistent: boolean;
  refuseReason: string | null;
};

function offsetLabelForLondonHm(dateIso: string, hm: string): "BST" | "GMT" | "OTHER" {
  const instant = londonInstantFromDateAndHm(dateIso, hm);
  if (!instant) return "OTHER";
  const parts = getUkParts(instant);
  const delta = ((parts.hour - instant.getUTCHours()) % 24 + 24) % 24;
  if (delta === 1) return "BST";
  if (delta === 0) return "GMT";
  return "OTHER";
}

async function buildPlan(ids: string[], intendedHm: string, allowStarted: boolean): Promise<PlanRow[]> {
  const rows = await prisma.studentLearningBooking.findMany({
    where: { id: { in: ids } },
    include: {
      schoolStudent: { include: { child: { select: { name: true } } } },
      journey: { select: { id: true, status: true } },
      shortLearningSession: { select: { id: true, status: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const plans: PlanRow[] = [];
  const now = Date.now();

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      plans.push({
        bookingId: id,
        studentName: "(missing)",
        status: "missing",
        currentStoredInstant: "",
        currentUkDisplay: "",
        currentUkHm: "",
        intendedLondonHm: intendedHm,
        proposedCorrectedUtc: "",
        proposedUkDisplay: "",
        offsetLabel: "OTHER",
        journeyId: null,
        journeyStatus: null,
        sessionId: null,
        sessionStatus: null,
        alreadyConsistent: false,
        refuseReason: "Booking ID not found",
      });
      continue;
    }

    const dateIso = formatUkDateIso(row.startsAt);
    const corrected = londonInstantFromDateAndHm(dateIso, intendedHm);
    const currentUkHm = formatUkTime(row.startsAt);
    const alreadyConsistent = Boolean(corrected) && corrected!.getTime() === row.startsAt.getTime();

    let refuseReason: string | null = null;
    if (!corrected) refuseReason = "Could not derive corrected London→UTC instant";
    if (["completed", "attended", "expired"].includes(row.status) && !allowStarted) {
      refuseReason = `Refusing status=${row.status} without --allow-started`;
    }
    if (!allowStarted && row.startsAt.getTime() <= now) {
      refuseReason = "Refusing already-started/past booking without --allow-started";
    }
    if (!allowStarted && row.shortLearningSession?.status === "ready") {
      refuseReason = "Refusing session status=ready without --allow-started";
    }
    if (alreadyConsistent) {
      refuseReason = "Idempotent skip: stored instant already matches intended London→UTC";
    }

    plans.push({
      bookingId: row.id,
      studentName: row.schoolStudent.child.name,
      status: row.status,
      currentStoredInstant: row.startsAt.toISOString(),
      currentUkDisplay: formatUkDateTime(row.startsAt),
      currentUkHm,
      intendedLondonHm: intendedHm,
      proposedCorrectedUtc: corrected?.toISOString() ?? "",
      proposedUkDisplay: corrected ? formatUkDateTime(corrected) : "",
      offsetLabel: offsetLabelForLondonHm(dateIso, intendedHm),
      journeyId: row.journey?.id ?? null,
      journeyStatus: row.journey?.status ?? null,
      sessionId: row.shortLearningSession?.id ?? null,
      sessionStatus: row.shortLearningSession?.status ?? null,
      alreadyConsistent,
      refuseReason,
    });
  }
  return plans;
}

async function applyPlans(plans: PlanRow[], actorUserId: string | null) {
  const actionable = plans.filter((p) => !p.refuseReason && p.proposedCorrectedUtc);
  for (const plan of actionable) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.studentLearningBooking.findUnique({ where: { id: plan.bookingId } });
      if (!row) return;
      const nextStart = new Date(plan.proposedCorrectedUtc);
      if (row.startsAt.getTime() === nextStart.getTime()) return;
      const nextEnd = new Date(nextStart.getTime() + row.durationMinutes * 60_000);
      const before = { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() };
      const updated = await tx.studentLearningBooking.update({
        where: { id: row.id },
        data: { startsAt: nextStart, endsAt: nextEnd },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "short_learning_booking_london_time_remediated",
          entityType: "StudentLearningBooking",
          entityId: row.id,
          metadataJson: JSON.stringify({
            before,
            after: { startsAt: updated.startsAt.toISOString(), endsAt: updated.endsAt.toISOString() },
            intendedLondonHm: plan.intendedLondonHm,
            offsetLabel: plan.offsetLabel,
            method: "londonInstantFromDateAndHm(ukDate, intendedHm)",
          }),
        },
      });
    });
  }
  return actionable.length;
}

async function main() {
  const ids = parseIds();
  const intendedHm = arg("intended-hm");
  const apply = arg("apply") === "true";
  const allowStarted = arg("allow-started") === "true";
  const allFlag = arg("all") === "true" || arg("all-suspects") === "true";

  if (allFlag) {
    console.error("Refusing bulk --all / --all-suspects. Pass explicit --ids only.");
    process.exit(2);
  }
  if (!ids.length) {
    console.error("Provide --ids=id1,id2");
    process.exit(2);
  }
  if (!intendedHm || !/^\d{1,2}:\d{2}$/.test(intendedHm)) {
    console.error("Provide explicit --intended-hm=HH:mm (Europe/London wall clock). No blind ±1h inference.");
    process.exit(2);
  }

  const plans = await buildPlan(ids, intendedHm, allowStarted);
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", intendedHm, count: plans.length, plans }, null, 2));
  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write.");
    return;
  }
  if (plans.some((p) => p.refuseReason)) {
    console.error("Some IDs refused; refusing entire apply batch.");
    process.exit(3);
  }
  const n = await applyPlans(plans, null);
  console.log(JSON.stringify({ applied: n }));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });