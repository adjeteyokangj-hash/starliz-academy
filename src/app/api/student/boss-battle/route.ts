import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/api_guard";
import { resolveParentScope } from "@/lib/parent_scope";
import { isBossUnlockEligibleV2 } from "@/lib/learningEngineV2";

type ProgressNotes = {
  assignmentId?: string;
  [key: string]: unknown;
};

const completeSchema = z.object({
  correctAnswers: z.number().int().min(0).max(5),
  questionsAnswered: z.number().int().min(1).max(5),
  heartsLeft: z.number().int().min(0).max(3),
});

function dayStartUtc(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function parseNotes(notes: string | null): ProgressNotes {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as unknown;
    if (parsed && typeof parsed === "object") return parsed as ProgressNotes;
  } catch {
    // Ignore malformed notes and continue with empty object.
  }
  return {};
}

const RARE_BOSS_BADGE_ID = "badge-boss-slayer";

async function resolveActiveChild(parentId: string): Promise<{ id: string; name: string; xp: number; coins: number; stars: number } | null> {
  const user = await prisma.user.findUnique({
    where: { id: parentId },
    select: { activeChildId: true },
  });
  if (!user?.activeChildId) return null;

  return prisma.childProfile.findFirst({
    where: { id: user.activeChildId, parentId, archived: false },
    select: { id: true, name: true, xp: true, coins: true, stars: true },
  });
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const child = await resolveActiveChild(parentScope.parentId);
  if (!child) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  const dayStart = dayStartUtc();

  const [latestLessonCompletion, latestBossBattle] = await Promise.all([
    prisma.progressRecord.findFirst({
      where: {
        childId: child.id,
        activityType: "lesson",
        completed: true,
        createdAt: { gte: dayStart },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, notes: true },
    }),
    prisma.progressRecord.findFirst({
      where: {
        childId: child.id,
        activityType: "boss_battle",
        completed: true,
        createdAt: { gte: dayStart },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, notes: true, xpEarned: true, coinsEarned: true, starsEarned: true },
    }),
  ]);

  const lessonNotes = parseNotes(latestLessonCompletion?.notes ?? null);
  const battleNotes = parseNotes(latestBossBattle?.notes ?? null);
  const skippedCount = typeof lessonNotes.skippedCount === "number" ? lessonNotes.skippedCount : 0;
  const unresolvedSkipped = typeof lessonNotes.unresolvedSkipped === "number" ? lessonNotes.unresolvedSkipped : 0;
  const accuracy = typeof lessonNotes.score === "number" ? lessonNotes.score : lessonNotes.masteryReady === true ? 80 : 0;
  const confidenceImproving = lessonNotes.confidenceImproving === true;
  const eligibility = isBossUnlockEligibleV2({
    accuracy,
    skippedCount,
    unresolvedSkipped,
    confidenceImproving,
  });
  const unlocked = Boolean(latestLessonCompletion && lessonNotes.masteryReady === true && eligibility.eligible);
  const lockReason = !latestLessonCompletion
    ? "Finish today's journey first to unlock Boss Battle."
    : unlocked
      ? null
      : lessonNotes.masteryReady !== true
        ? "Complete lesson mastery first. Boss Battle unlocks after strong lesson understanding."
        : (eligibility.reason ?? "Complete your review first. Fix all skipped questions to unlock Boss Battle.");

  return NextResponse.json({
    ok: true,
    unlocked,
    child: { id: child.id, name: child.name },
    lockReason,
    lessonAssignmentId: typeof lessonNotes.assignmentId === "string" ? lessonNotes.assignmentId : null,
    completedLessonAt: latestLessonCompletion?.createdAt?.toISOString() ?? null,
    alreadyPlayedToday: Boolean(latestBossBattle),
    previousBattle: latestBossBattle
      ? {
          playedAt: latestBossBattle.createdAt.toISOString(),
          rewards: {
            xpEarned: latestBossBattle.xpEarned,
            coinsEarned: latestBossBattle.coinsEarned,
            starsEarned: latestBossBattle.starsEarned,
          },
          win: Boolean(battleNotes.win),
          perfectWin: Boolean(battleNotes.perfectWin),
          badge: typeof battleNotes.badge === "string" ? battleNotes.badge : null,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const parentScope = await resolveParentScope(session);
  if (!parentScope) {
    return NextResponse.json({ error: "Parent account not found." }, { status: 404 });
  }

  const child = await resolveActiveChild(parentScope.parentId);
  if (!child) {
    return NextResponse.json({ error: "No active student selected." }, { status: 400 });
  }

  let body: z.infer<typeof completeSchema>;
  try {
    body = completeSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid boss battle payload." }, { status: 400 });
  }

  const dayStart = dayStartUtc();

  const [lessonCompletion, existingBattle] = await Promise.all([
    prisma.progressRecord.findFirst({
      where: {
        childId: child.id,
        activityType: "lesson",
        completed: true,
        createdAt: { gte: dayStart },
      },
      orderBy: { createdAt: "desc" },
      select: { notes: true },
    }),
    prisma.progressRecord.findFirst({
      where: {
        childId: child.id,
        activityType: "boss_battle",
        completed: true,
        createdAt: { gte: dayStart },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, xpEarned: true, coinsEarned: true, starsEarned: true, notes: true },
    }),
  ]);

  if (!lessonCompletion) {
    return NextResponse.json({ error: "Finish today's journey before starting Boss Battle." }, { status: 403 });
  }

  const lessonNotes = parseNotes(lessonCompletion.notes);
  if (lessonNotes.masteryReady !== true) {
    return NextResponse.json({ error: "Complete lesson mastery first. Boss Battle unlocks after strong lesson understanding." }, { status: 403 });
  }

  const postSkippedCount = typeof lessonNotes.skippedCount === "number" ? lessonNotes.skippedCount : 0;
  const postUnresolved = typeof lessonNotes.unresolvedSkipped === "number" ? lessonNotes.unresolvedSkipped : 0;
  const postAccuracy = typeof lessonNotes.score === "number" ? lessonNotes.score : 0;
  const postConfidenceImproving = lessonNotes.confidenceImproving === true;
  const postEligibility = isBossUnlockEligibleV2({
    accuracy: postAccuracy,
    skippedCount: postSkippedCount,
    unresolvedSkipped: postUnresolved,
    confidenceImproving: postConfidenceImproving,
  });
  if (!postEligibility.eligible) {
    return NextResponse.json({ error: postEligibility.reason ?? "Complete your review to unlock Boss Battle." }, { status: 403 });
  }

  if (existingBattle) {
    const existingNotes = parseNotes(existingBattle.notes);
    return NextResponse.json({
      ok: true,
      alreadyClaimed: true,
      rewards: {
        xpEarned: existingBattle.xpEarned,
        coinsEarned: existingBattle.coinsEarned,
        starsEarned: existingBattle.starsEarned,
      },
      win: Boolean(existingNotes.win),
      perfectWin: Boolean(existingNotes.perfectWin),
      badge: typeof existingNotes.badge === "string" ? existingNotes.badge : null,
    });
  }

  const correctAnswers = body.correctAnswers;
  const questionsAnswered = body.questionsAnswered;
  const heartsLeft = body.heartsLeft;
  const score = Math.round((correctAnswers / Math.max(1, questionsAnswered)) * 100);

  const win = correctAnswers >= 5;
  const perfectWin = win && heartsLeft === 3;

  const xpEarned = 10;
  const coinsEarned = win ? 15 : 0;
  const starsEarned = win ? 1 : 0;
  const badge = perfectWin ? RARE_BOSS_BADGE_ID : null;

  await prisma.$transaction(async (tx) => {
    if (perfectWin) {
      await tx.rewardItem.upsert({
        where: { id: RARE_BOSS_BADGE_ID },
        update: {
          name: "Boss Slayer Badge",
          description: "Rare badge for a perfect Boss Battle win.",
          category: "badges",
          cost: 0,
          unlockLevel: 1,
          isActive: true,
        },
        create: {
          id: RARE_BOSS_BADGE_ID,
          name: "Boss Slayer Badge",
          description: "Rare badge for a perfect Boss Battle win.",
          category: "badges",
          cost: 0,
          unlockLevel: 1,
          isActive: true,
        },
      });

      await tx.childReward.upsert({
        where: { childId_rewardId: { childId: child.id, rewardId: RARE_BOSS_BADGE_ID } },
        create: {
          childId: child.id,
          rewardId: RARE_BOSS_BADGE_ID,
          isEquipped: false,
        },
        update: {},
      });
    }

    await tx.progressRecord.create({
      data: {
        childId: child.id,
        activityType: "boss_battle",
        activityName: "Daily Boss Battle",
        xpEarned,
        coinsEarned,
        starsEarned,
        score,
        correct: win,
        accuracy: score,
        completed: true,
        notes: JSON.stringify({
          type: "boss_battle",
          win,
          perfectWin,
          badge,
          correctAnswers,
          questionsAnswered,
          heartsLeft,
          sourceLessonAssignmentId: typeof lessonNotes.assignmentId === "string" ? lessonNotes.assignmentId : null,
        }),
      },
    });

    await tx.childProfile.update({
      where: { id: child.id },
      data: {
        xp: child.xp + xpEarned,
        coins: child.coins + coinsEarned,
        stars: child.stars + starsEarned,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    alreadyClaimed: false,
    rewards: { xpEarned, coinsEarned, starsEarned },
    win,
    perfectWin,
    badge,
  }, { status: 201 });
}
