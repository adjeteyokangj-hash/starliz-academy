import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { mergeWeakAreas, parseWeakAreaMetadata, stringifyWeakAreaMetadata } from "@/lib/weakAreas";
import { sendEmail } from "@/lib/email-provider";
import { autoBuildLessonForStudent } from "@/lib/autoLesson";
import { applyRetentionRules, parseRetentionMetadata } from "@/lib/retentionScheduler";
import { calculateConfidence, isBossUnlockEligibleV2, skillStatusFromConfidence, toLegacyStudentSkillStatus } from "@/lib/learningEngineV2";

const progressSchema = z.object({
  studentId: z.string().min(1),
  assignmentId: z.string().optional(),
  assignmentCompleted: z.boolean().optional(),
  completedAt: z.string().optional().nullable(),
  contentId: z.string().optional(),
  subject: z.string().min(1),
  type: z.string().optional(),
  skillFocus: z.string().optional(),
  score: z.number().min(0).max(100).default(0),
  correct: z.number().int().min(0).default(0),
  incorrect: z.number().int().min(0).default(0),
  attempts: z.number().int().min(1).default(1),
  timeSpent: z.number().int().min(0).default(0),
  weakWords: z.array(z.string()).default([]),
  weakSkills: z.array(z.string()).default([]),
  firstTryCorrect: z.number().int().min(0).default(0),
  retryCorrect: z.number().int().min(0).default(0),
  skippedCount: z.number().int().min(0).default(0),
  unresolvedSkipped: z.number().int().min(0).default(0),
  masteryReady: z.boolean().optional(),
  intervention: z.object({
    mode: z.boolean().optional(),
    weakDetected: z.boolean().optional(),
    launchedAt: z.string().optional().nullable(),
    completedAt: z.string().optional().nullable(),
    primarySkill: z.string().optional().nullable(),
    supportSkill: z.string().optional().nullable(),
    baselineAccuracy: z.number().optional().nullable(),
    improvementPct: z.number().optional().nullable(),
  }).optional().nullable(),
  warmup: z.object({
    prompt: z.string().optional(),
    transcript: z.string().optional(),
    phase: z.enum(["idle", "listening", "thinking", "responding", "celebrating"]).optional(),
    mood: z.enum(["happy", "nervous", "tired", "frustrated", "excited", "quiet_shy", "neutral"]).optional(),
    confidenceEstimate: z.number().int().min(0).max(100).optional(),
    energyEstimate: z.number().int().min(0).max(100).optional(),
    hesitationMs: z.number().int().min(0).optional(),
    adaptation: z.object({
      pacing: z.enum(["slower", "balanced", "faster"]).optional(),
      hintStyle: z.enum(["gentle", "standard", "challenge"]).optional(),
      sessionMode: z.enum(["short", "standard", "challenge"]).optional(),
    }).optional(),
  }).optional().nullable(),
});

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  try {
    const body = progressSchema.parse(await request.json());
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const child = await prisma.childProfile.findFirst({
      where: { id: body.studentId, parentId: parentScope.parentId, archived: false },
      select: {
        id: true,
        name: true,
        xp: true,
        coins: true,
        stars: true,
        streak: true,
        parent: { select: { email: true, name: true } },
        progressRecords: {
          where: { completed: true, createdAt: { gte: dayStart } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!child) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const firstTryRate = body.attempts > 0 ? body.firstTryCorrect / body.attempts : 0;
    const recentPerformance = body.score / 100;
    const confidence = calculateConfidence({
      accuracy: body.score,
      firstTryRate,
      recentPerformance,
    });
    const confidenceStatus = skillStatusFromConfidence(confidence);

    const latestLesson = await prisma.progressRecord.findFirst({
      where: {
        childId: body.studentId,
        completed: true,
        activityType: { in: ["lesson", "ai_daily", "spelling", "math", "reading"] },
      },
      orderBy: { createdAt: "desc" },
      select: { notes: true },
    });

    let previousConfidence = 0;
    try {
      const parsed = JSON.parse(String(latestLesson?.notes ?? "{}")) as { confidence?: unknown };
      previousConfidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    } catch {
      previousConfidence = 0;
    }
    const confidenceDelta = confidence - previousConfidence;
    const confidenceImproving = confidenceDelta >= 0;
    const warmupConfidence = body.warmup?.confidenceEstimate ?? null;
    const warmupEnergy = body.warmup?.energyEstimate ?? null;
    const warmupMood = body.warmup?.mood ?? null;
    const frustrationSignals = warmupMood === "frustrated" ? "high" : warmupMood === "nervous" || warmupMood === "quiet_shy" ? "medium" : warmupMood === "tired" ? "medium" : "low";
    const engagementLevel = warmupEnergy !== null ? (warmupEnergy >= 75 ? "high" : warmupEnergy >= 50 ? "medium" : "low") : "medium";
    const bossEligibility = isBossUnlockEligibleV2({
      accuracy: body.score,
      skippedCount: body.skippedCount,
      unresolvedSkipped: body.unresolvedSkipped,
      confidenceImproving,
    });

    const masteryXp = (body.firstTryCorrect * 10) + (body.retryCorrect * 5) + (body.skippedCount * 1);
    const xpEarned = masteryXp + (body.score === 100 ? 20 : 0);
    const coinsEarned = Math.max(1, Math.floor(body.correct / 2) + (body.incorrect === 0 ? 2 : 0));
    const starsEarned = Math.max(1, body.correct + (body.score >= 80 ? 3 : 0));
    const streakContinued = child.progressRecords.length === 0;
    const masteryReady = body.masteryReady ?? bossEligibility.eligible;

    const record = await prisma.progressRecord.create({
      data: {
        childId: body.studentId,
        activityType: body.subject,
        activityName: body.contentId ? `Assigned content ${body.contentId}` : `${body.subject} practice`,
        starsEarned,
        xpEarned,
        coinsEarned,
        score: body.score,
        correct: body.incorrect === 0,
        accuracy: body.score,
        completed: true,
        notes: JSON.stringify({
          type: body.type,
          assignmentId: body.assignmentId,
          contentId: body.contentId,
          correct: body.correct,
          incorrect: body.incorrect,
          score: body.score,
          attempts: body.attempts,
          timeSpent: body.timeSpent,
          weakWords: body.weakWords,
          weakSkills: body.weakSkills,
          unresolvedSkipped: body.unresolvedSkipped,
          skippedCount: body.skippedCount,
          masteryReady,
          confidence,
          confidenceDelta,
          confidenceImproving,
          confidenceStatus,
          bossUnlockEligible: bossEligibility.eligible,
          bossLockReason: bossEligibility.reason,
          intervention: body.intervention ?? null,
          warmup: body.warmup ?? null,
          sessionSignals: {
            learningConfidence: confidenceStatus,
            speechConfidence: warmupConfidence,
            engagementLevel,
            frustrationSignals,
            emotionalMood: warmupMood,
          },
        }),
      },
    });

    await prisma.childProfile.update({
      where: { id: body.studentId },
      data: {
        xp: child.xp + xpEarned,
        coins: child.coins + coinsEarned,
        stars: child.stars + starsEarned,
        streak: streakContinued ? child.streak + 1 : child.streak,
        level: Math.max(1, Math.floor((child.xp + xpEarned) / 100) + 1),
      },
    });

    const weakSkills = mergeWeakAreas(body.skillFocus ? [body.skillFocus] : [], body.weakSkills);
    const interventionMode = body.intervention?.mode === true;
    const detectedAtIso = new Date().toISOString();
    if (body.weakWords.length || weakSkills.length) {
      for (const skill of weakSkills.length ? weakSkills : [`${body.subject} practice`]) {
        const existing = await prisma.weakArea.findUnique({
          where: {
            studentId_subject_skillFocus: {
              studentId: body.studentId,
              subject: body.subject,
              skillFocus: skill,
            },
          },
          select: { metadataJson: true, attemptsCount: true },
        });
        const existingMeta = parseWeakAreaMetadata(existing?.metadataJson);
        const existingRetentionMeta = parseRetentionMetadata(existing?.metadataJson);
        const weakWords = mergeWeakAreas(existingMeta.weakWords, body.weakWords);
        const mergedWeakSkills = mergeWeakAreas(existingMeta.weakSkills, [skill]);
        const existingIntervention = existingMeta.intervention ?? {};
        const baselineAccuracy = body.intervention?.baselineAccuracy ?? existingIntervention.baselineAccuracy ?? body.score;
        const improvementPct = body.intervention?.improvementPct
          ?? (typeof baselineAccuracy === "number" ? body.score - baselineAccuracy : undefined);
        const interventionMeta = {
          weakSkillDetectedAt: existingIntervention.weakSkillDetectedAt ?? detectedAtIso,
          weakSkillCode: body.intervention?.primarySkill ?? skill,
          launchedAt: body.intervention?.launchedAt ?? existingIntervention.launchedAt ?? detectedAtIso,
          completedAt: interventionMode ? (body.intervention?.completedAt ?? detectedAtIso) : existingIntervention.completedAt,
          improvementPct,
          baselineAccuracy,
          latestAccuracy: body.score,
          mode: interventionMode ? "mission" : (existingIntervention.mode ?? "auto_launch"),
        };
        const retentionMeta = applyRetentionRules({
          existing: {
            ...existingRetentionMeta,
            weakWords,
            weakSkills: mergedWeakSkills,
          },
          accuracy: body.score,
          retries: body.incorrect,
        });

        await prisma.weakArea.upsert({
          where: {
            studentId_subject_skillFocus: {
              studentId: body.studentId,
              subject: body.subject,
              skillFocus: skill,
            },
          },
          create: {
            studentId: body.studentId,
            subject: body.subject,
            skillFocus: skill,
            weaknessType: body.incorrect > 0 ? "follow_up_needed" : "practice_review",
            accuracy: Math.round(body.score),
            attemptsCount: body.attempts,
            currentDifficulty: 1,
            metadataJson: stringifyWeakAreaMetadata({
              ...retentionMeta,
              assignmentId: body.assignmentId,
              lastScore: body.score,
              intervention: interventionMeta,
            }),
          },
          update: {
            weaknessType: body.incorrect > 0 ? "follow_up_needed" : "practice_review",
            accuracy: Math.round(body.score),
            attemptsCount: (existing?.attemptsCount ?? 0) + body.attempts,
            lastDetectedAt: new Date(),
            status: "active",
            metadataJson: stringifyWeakAreaMetadata({
              ...retentionMeta,
              assignmentId: body.assignmentId,
              lastScore: body.score,
              intervention: interventionMeta,
            }),
          },
        });
      }
    }

    if (weakSkills.length) {
      const skillAttempts = Math.max(1, body.attempts);
      const skillCorrect = Math.max(0, body.correct);
      const skillAccuracy = Math.max(0, Math.min(100, (skillCorrect / skillAttempts) * 100));
      const mappedStatus = toLegacyStudentSkillStatus(confidenceStatus);

      for (const skill of weakSkills) {
        await prisma.studentSkill.upsert({
          where: { studentId_skill: { studentId: body.studentId, skill } },
          create: {
            studentId: body.studentId,
            skill,
            attempts: skillAttempts,
            correct: skillCorrect,
            accuracy: skillAccuracy,
            status: mappedStatus,
          },
          update: {
            attempts: { increment: skillAttempts },
            correct: { increment: skillCorrect },
            accuracy: skillAccuracy,
            status: mappedStatus,
          },
        });
      }
    }

    if (body.assignmentId) {
      const markAssignmentCompleted = body.assignmentCompleted ?? true;
      const parsedCompletedAt = body.completedAt ? new Date(body.completedAt) : new Date();
      const completionTime = Number.isNaN(parsedCompletedAt.getTime()) ? new Date() : parsedCompletedAt;
      await prisma.assignment.updateMany({
        where: { id: body.assignmentId, studentId: body.studentId },
        data: {
          status: markAssignmentCompleted ? "completed" : "in_progress",
          completedAt: markAssignmentCompleted ? completionTime : null,
        },
      });
    }

    const weakStill = await prisma.studentSkill.findMany({
      where: {
        studentId: body.studentId,
        status: "weak",
      },
      select: { id: true },
      take: 1,
    });

    if (weakStill.length > 0) {
      await autoBuildLessonForStudent({
        studentId: body.studentId,
        actorUserId: session.userId,
      });
    }

    const reinforceTomorrow = body.score < 60 || body.incorrect > 0 || body.weakSkills.length > 0;
    const weakSummary = body.weakSkills.length || body.weakWords.length
      ? `<p><strong>Follow-up focus:</strong> ${[...body.weakSkills, ...body.weakWords].slice(0, 8).join(", ")}</p>`
      : "<p>No major weak areas detected today.</p>";
    const parentInsight = reinforceTomorrow
      ? `<p><strong>Insight:</strong> Your child struggled with ${body.weakSkills[0] ?? body.skillFocus ?? "today's focus"} today. We are reinforcing this tomorrow.</p>`
      : "<p><strong>Insight:</strong> Confidence is improving and core skills are becoming secure.</p>";
    const parentMoodInsight = warmupMood
      ? `<p><strong>Session mood:</strong> ${warmupMood.replace("_", " ")} (engagement ${engagementLevel}, frustration ${frustrationSignals}).</p>`
      : "";
    const parentEscalation = body.weakSkills.length > 2
      ? "<p><strong>Notice:</strong> Multiple weak skills detected today. Tomorrow's lesson will include extra repair support.</p>"
      : "";

    const notification = await sendEmail({
      to: child.parent.email,
      subject: `${child.name} completed a StarLiz lesson`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h2>Lesson completed</h2>
          <p>${child.name} completed today&apos;s StarLiz Academy lesson.</p>
          <p><strong>Score:</strong> ${body.score}%</p>
          <p><strong>Correct:</strong> ${body.correct} &nbsp; <strong>To practise:</strong> ${body.incorrect}</p>
          <p><strong>Rewards:</strong> +${xpEarned} XP, +${coinsEarned} coins, +${starsEarned} stars${streakContinued ? `, streak ${child.streak + 1}` : ""}</p>
          ${weakSummary}
          ${parentInsight}
          ${parentMoodInsight}
          ${parentEscalation}
        </div>
      `,
      text: `${child.name} completed a StarLiz lesson. Score: ${body.score}%. Correct: ${body.correct}. To practise: ${body.incorrect}. Rewards: +${xpEarned} XP, +${coinsEarned} coins, +${starsEarned} stars.`,
    });

    return NextResponse.json({
      ok: true,
      record,
      rewards: { xpEarned, coinsEarned, starsEarned, streak: streakContinued ? child.streak + 1 : child.streak },
      notification,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid progress payload." }, { status: 400 });
  }
}
