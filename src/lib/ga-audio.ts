import { prisma } from "@/lib/db";
import {
  canServeGaAudioToStudent,
  GA_AUDIO_APPROVAL_STATUSES,
  GA_AUDIO_ENHANCEMENT_STATUSES,
  GA_AUDIO_QUALITY_STATUSES,
  GA_AUDIO_REVIEW_STATUSES,
  GA_AUDIO_SOURCE_TYPES,
  isReferenceOnlySourceType,
} from "@/lib/ga-voice";

const POSITIVE_AUDIO_REVIEW_STATUSES = [
  "APPROVED_FOR_EARLY_LEARNING",
  "NEEDS_NATIVE_REVIEW",
  "NATIVE_VERIFIED",
] as const;

const RECORDING_REVIEW_STATUSES = ["PENDING", "REVIEWED", "NEEDS_REPEAT", "FLAGGED"] as const;
const REFERENCE_PERMISSION_STATUSES = ["UNKNOWN", "REFERENCE_ONLY", "LICENSED"] as const;

export type GaAudioAssetInput = {
  wordId?: string | null;
  lessonId?: string | null;
  phraseText?: string | null;
  songId?: string | null;
  letterKey?: string | null;
  soundKey?: string | null;
  audioUrl: string;
  audioStorageKey?: string | null;
  sourceType: string;
  reviewStatus?: string | null;
  approvalStatus?: string | null;
  qualityStatus?: string | null;
  enhancementStatus?: string | null;
  confidenceLevel?: number | null;
  pronunciationNote?: string | null;
  adminNotes?: string | null;
};

export type GaAudioApprovalInput = {
  audioAssetId: string;
  reviewStatus: string;
  notes?: string | null;
};

export type GaAudioRejectInput = {
  audioAssetId: string;
  notes?: string | null;
};

export type GaAudioReplaceInput = {
  audioAssetId: string;
  replacement: GaAudioAssetInput;
  notes?: string | null;
};

export type GaAudioDeleteInput = {
  audioAssetId: string;
  notes?: string | null;
};

export type GaPronunciationReferenceInput = {
  referenceType: string;
  sourceUrl: string;
  sourceTitle?: string | null;
  speakerName?: string | null;
  channelName?: string | null;
  timestampStart?: string | null;
  timestampEnd?: string | null;
  linkedWordId?: string | null;
  linkedLessonId?: string | null;
  linkedLetter?: string | null;
  linkedSound?: string | null;
  linkedPhraseText?: string | null;
  pronunciationNote?: string | null;
  permissionStatus?: string | null;
  reviewStatus?: string | null;
  confidenceLevel?: number | null;
};

export type GaStudentRecordingReviewInput = {
  recordingId: string;
  reviewStatus: string;
  adminFeedback?: string | null;
};

export type GaSongLessonInput = {
  title: string;
  level: string;
  category: string;
  lyricsGa: string;
  lyricsEnglish?: string | null;
  wordIdsUsed?: string[];
  sourceType?: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text ? text : null;
}

function optionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Confidence level must be an integer.");
  return parsed;
}

function appendAdminNote(existing: string | null | undefined, note: string | null | undefined): string | null {
  const next = cleanText(note);
  const current = cleanText(existing);
  if (!next) return current || null;
  if (!current) return next;
  return `${current}\n${next}`;
}

function assertAllowed<T extends readonly string[]>(value: string, allowed: T, label: string): T[number] {
  if (!allowed.includes(value as T[number])) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

function assertLinkedAnchor(input: Pick<GaAudioAssetInput, "wordId" | "lessonId" | "phraseText" | "songId" | "letterKey" | "soundKey">) {
  if (input.wordId || input.lessonId || input.phraseText || input.songId || input.letterKey || input.soundKey) return;
  throw new Error("Audio assets must link to a word, lesson, phrase, song, letter, or sound.");
}

async function assertAudioAnchorsExist(input: GaAudioAssetInput) {
  assertLinkedAnchor(input);

  if (input.wordId) {
    const word = await prisma.gaWord.findUnique({ where: { id: input.wordId }, select: { id: true, reviewStatus: true } });
    if (!word) throw new Error("Linked Ga word was not found.");
    if (word.reviewStatus !== "Approved") throw new Error("Audio assets for words must link to Approved Ga words.");
  }

  if (input.lessonId) {
    const lesson = await prisma.gaLesson.findUnique({ where: { id: input.lessonId }, select: { id: true } });
    if (!lesson) throw new Error("Linked Ga lesson was not found.");
  }

  if (input.songId) {
    const song = await prisma.gaSongLesson.findUnique({ where: { id: input.songId }, select: { id: true } });
    if (!song) throw new Error("Linked Ga song lesson was not found.");
  }
}

export function buildGaAudioAssetData(input: GaAudioAssetInput) {
  const audioUrl = cleanText(input.audioUrl);
  if (!audioUrl) throw new Error("Audio URL is required.");

  const sourceType = assertAllowed(cleanText(input.sourceType), GA_AUDIO_SOURCE_TYPES, "Source type");
  if (isReferenceOnlySourceType(sourceType)) {
    throw new Error("Pronunciation references must be stored as reference links, not app audio assets.");
  }

  const reviewStatus = assertAllowed(cleanText(input.reviewStatus) || "DRAFT", GA_AUDIO_REVIEW_STATUSES, "Review status");
  const approvalStatus = assertAllowed(cleanText(input.approvalStatus) || "PENDING", GA_AUDIO_APPROVAL_STATUSES, "Approval status");
  const qualityStatus = assertAllowed(cleanText(input.qualityStatus) || "UNCHECKED", GA_AUDIO_QUALITY_STATUSES, "Quality status");
  const enhancementStatus = assertAllowed(cleanText(input.enhancementStatus) || "NOT_APPLIED", GA_AUDIO_ENHANCEMENT_STATUSES, "Enhancement status");

  return {
    wordId: optionalText(input.wordId),
    lessonId: optionalText(input.lessonId),
    phraseText: optionalText(input.phraseText),
    songId: optionalText(input.songId),
    letterKey: optionalText(input.letterKey),
    soundKey: optionalText(input.soundKey),
    audioUrl,
    audioStorageKey: optionalText(input.audioStorageKey),
    sourceType,
    reviewStatus,
    approvalStatus,
    qualityStatus,
    enhancementStatus,
    confidenceLevel: optionalInt(input.confidenceLevel),
    pronunciationNote: optionalText(input.pronunciationNote),
    adminNotes: optionalText(input.adminNotes),
  };
}

export function buildGaPronunciationReferenceData(input: GaPronunciationReferenceInput) {
  const referenceType = cleanText(input.referenceType);
  if (!referenceType) throw new Error("Reference type is required.");
  const sourceUrl = cleanText(input.sourceUrl);
  if (!sourceUrl) throw new Error("Reference source URL is required.");

  const permissionStatus = assertAllowed(cleanText(input.permissionStatus) || "REFERENCE_ONLY", REFERENCE_PERMISSION_STATUSES, "Permission status");
  if (/(youtube\.com|youtu\.be)/i.test(sourceUrl) && permissionStatus !== "REFERENCE_ONLY") {
    throw new Error("YouTube pronunciation sources are reference-only and cannot be marked as licensed/downloadeable assets.");
  }

  return {
    referenceType,
    sourceUrl,
    sourceTitle: optionalText(input.sourceTitle),
    speakerName: optionalText(input.speakerName),
    channelName: optionalText(input.channelName),
    timestampStart: optionalText(input.timestampStart),
    timestampEnd: optionalText(input.timestampEnd),
    linkedWordId: optionalText(input.linkedWordId),
    linkedLessonId: optionalText(input.linkedLessonId),
    linkedLetter: optionalText(input.linkedLetter),
    linkedSound: optionalText(input.linkedSound),
    linkedPhraseText: optionalText(input.linkedPhraseText),
    pronunciationNote: optionalText(input.pronunciationNote),
    permissionStatus,
    reviewStatus: assertAllowed(cleanText(input.reviewStatus) || "DRAFT", GA_AUDIO_REVIEW_STATUSES, "Review status"),
    confidenceLevel: optionalInt(input.confidenceLevel),
  };
}

export async function writeGaAudioAuditLog(input: {
  audioAssetId?: string | null;
  referenceId?: string | null;
  studentRecordingId?: string | null;
  action: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  performedById?: string | null;
}) {
  return prisma.gaAudioAuditLog.create({
    data: {
      audioAssetId: optionalText(input.audioAssetId),
      referenceId: optionalText(input.referenceId),
      studentRecordingId: optionalText(input.studentRecordingId),
      action: cleanText(input.action),
      oldStatus: optionalText(input.oldStatus),
      newStatus: optionalText(input.newStatus),
      notes: optionalText(input.notes),
      performedById: optionalText(input.performedById),
    },
  });
}

export async function createGaAudioAsset(input: GaAudioAssetInput, actorUserId?: string | null) {
  const data = buildGaAudioAssetData(input);
  await assertAudioAnchorsExist(data);

  const asset = await prisma.gaAudioAsset.create({
    data: {
      ...data,
      createdById: optionalText(actorUserId),
    },
  });

  await writeGaAudioAuditLog({
    audioAssetId: asset.id,
    action: "created",
    newStatus: `${asset.approvalStatus}:${asset.reviewStatus}`,
    performedById: actorUserId,
    notes: data.adminNotes,
  });

  return getGaAudioAssetById(asset.id);
}

export async function listGaAudioAssets(limit = 100, filters?: { sourceType?: string | null; includeDeleted?: boolean }) {
  const sourceType = optionalText(filters?.sourceType);
  const includeDeleted = filters?.includeDeleted === true;

  return prisma.gaAudioAsset.findMany({
    where: {
      ...(sourceType ? { sourceType: assertAllowed(sourceType, GA_AUDIO_SOURCE_TYPES, "Source type") } : {}),
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    include: {
      word: { select: { id: true, englishWord: true, gaWord: true, category: true } },
      lesson: { select: { id: true, title: true, slug: true } },
      song: { select: { id: true, title: true } },
      createdBy: { select: { id: true, email: true, name: true } },
      approvedBy: { select: { id: true, email: true, name: true } },
      rejectedBy: { select: { id: true, email: true, name: true } },
      deletedBy: { select: { id: true, email: true, name: true } },
      replacedByAudio: {
        select: {
          id: true,
          audioUrl: true,
          reviewStatus: true,
          approvalStatus: true,
          qualityStatus: true,
          enhancementStatus: true,
          createdAt: true,
          deletedAt: true,
        },
      },
      replacedAssets: {
        where: includeDeleted ? undefined : { deletedAt: null },
        select: {
          id: true,
          audioUrl: true,
          reviewStatus: true,
          approvalStatus: true,
          qualityStatus: true,
          enhancementStatus: true,
          createdAt: true,
          deletedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      currentForSong: { select: { id: true, title: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(200, limit)),
  });
}

export async function approveGaAudioAsset(input: GaAudioApprovalInput, actorUserId?: string | null) {
  const audioAssetId = cleanText(input.audioAssetId);
  if (!audioAssetId) throw new Error("Audio asset id is required.");
  const nextReviewStatus = assertAllowed(cleanText(input.reviewStatus), POSITIVE_AUDIO_REVIEW_STATUSES, "Approval review status");

  const current = await prisma.gaAudioAsset.findUnique({ where: { id: audioAssetId } });
  if (!current) return null;

  const updated = await prisma.gaAudioAsset.update({
    where: { id: audioAssetId },
    data: {
      approvalStatus: "APPROVED",
      reviewStatus: nextReviewStatus,
      approvedById: optionalText(actorUserId),
      approvedAt: new Date(),
      rejectedById: null,
      rejectedAt: null,
    },
  });

  await writeGaAudioAuditLog({
    audioAssetId: updated.id,
    action: "approved",
    oldStatus: `${current.approvalStatus}:${current.reviewStatus}`,
    newStatus: `${updated.approvalStatus}:${updated.reviewStatus}`,
    performedById: actorUserId,
    notes: input.notes,
  });

  if (updated.songId) {
    await prisma.gaSongLesson.update({
      where: { id: updated.songId },
      data: {
        currentAudioAssetId: updated.id,
        reviewStatus: updated.reviewStatus,
        approvedById: optionalText(actorUserId),
        approvedAt: new Date(),
      },
    });
  }

  return getGaAudioAssetById(updated.id);
}

export async function rejectGaAudioAsset(input: GaAudioRejectInput, actorUserId?: string | null) {
  const audioAssetId = cleanText(input.audioAssetId);
  if (!audioAssetId) throw new Error("Audio asset id is required.");

  const current = await prisma.gaAudioAsset.findUnique({ where: { id: audioAssetId } });
  if (!current) return null;

  const updated = await prisma.gaAudioAsset.update({
    where: { id: audioAssetId },
    data: {
      approvalStatus: "REJECTED",
      reviewStatus: "REJECTED",
      rejectedById: optionalText(actorUserId),
      rejectedAt: new Date(),
      approvedById: null,
      approvedAt: null,
    },
  });

  await writeGaAudioAuditLog({
    audioAssetId: updated.id,
    action: "rejected",
    oldStatus: `${current.approvalStatus}:${current.reviewStatus}`,
    newStatus: `${updated.approvalStatus}:${updated.reviewStatus}`,
    performedById: actorUserId,
    notes: input.notes,
  });

  return getGaAudioAssetById(updated.id);
}

export async function replaceGaAudioAsset(input: GaAudioReplaceInput, actorUserId?: string | null) {
  const audioAssetId = cleanText(input.audioAssetId);
  if (!audioAssetId) throw new Error("Audio asset id is required.");

  const current = await prisma.gaAudioAsset.findUnique({ where: { id: audioAssetId } });
  if (!current) return null;

  const replacementData = buildGaAudioAssetData({
    ...input.replacement,
    wordId: input.replacement.wordId ?? current.wordId,
    lessonId: input.replacement.lessonId ?? current.lessonId,
    phraseText: input.replacement.phraseText ?? current.phraseText,
    songId: input.replacement.songId ?? current.songId,
    letterKey: input.replacement.letterKey ?? current.letterKey,
    soundKey: input.replacement.soundKey ?? current.soundKey,
  });
  await assertAudioAnchorsExist(replacementData);

  const result = await prisma.$transaction(async (tx) => {
    const replacement = await tx.gaAudioAsset.create({
      data: {
        ...replacementData,
        createdById: optionalText(actorUserId),
      },
    });

    await tx.gaAudioAsset.update({
      where: { id: audioAssetId },
      data: {
        approvalStatus: "REPLACED",
        reviewStatus: "REPLACED",
        replacedByAudioId: replacement.id,
      },
    });

    await tx.gaAudioAuditLog.create({
      data: {
        audioAssetId,
        action: "replaced",
        oldStatus: `${current.approvalStatus}:${current.reviewStatus}`,
        newStatus: "REPLACED:REPLACED",
        performedById: optionalText(actorUserId),
        notes: optionalText(input.notes),
      },
    });

    await tx.gaAudioAuditLog.create({
      data: {
        audioAssetId: replacement.id,
        action: "created",
        newStatus: `${replacement.approvalStatus}:${replacement.reviewStatus}`,
        performedById: optionalText(actorUserId),
        notes: optionalText(input.notes),
      },
    });

    return replacement;
  });

  return getGaAudioAssetById(result.id);
}

export async function softDeleteGaAudioAsset(input: GaAudioDeleteInput, actorUserId?: string | null) {
  const audioAssetId = cleanText(input.audioAssetId);
  if (!audioAssetId) throw new Error("Audio asset id is required.");

  const current = await prisma.gaAudioAsset.findUnique({
    where: { id: audioAssetId },
    include: {
      currentForSong: { select: { id: true, title: true } },
    },
  });

  if (!current) return null;
  if (current.deletedAt) return getGaAudioAssetById(current.id);
  if (current.currentForSong) {
    throw new Error(`Current song audio for \"${current.currentForSong.title}\" cannot be deleted. Replace or detach it first.`);
  }
  if (isStudentFacingGaAudio(current.reviewStatus, current.approvalStatus)) {
    throw new Error("Student-safe approved audio cannot be deleted directly. Replace or reject it first.");
  }

  const updated = await prisma.gaAudioAsset.update({
    where: { id: audioAssetId },
    data: {
      deletedAt: new Date(),
      deletedById: optionalText(actorUserId),
      adminNotes: appendAdminNote(current.adminNotes, optionalText(input.notes) ?? "Soft deleted in admin recording library."),
    },
  });

  await writeGaAudioAuditLog({
    audioAssetId: updated.id,
    action: "deleted",
    oldStatus: `${current.approvalStatus}:${current.reviewStatus}`,
    newStatus: `${updated.approvalStatus}:${updated.reviewStatus}`,
    performedById: actorUserId,
    notes: input.notes,
  });

  return getGaAudioAssetById(updated.id);
}

export async function createGaPronunciationReference(input: GaPronunciationReferenceInput, actorUserId?: string | null) {
  const data = buildGaPronunciationReferenceData(input);

  if (data.linkedWordId) {
    const word = await prisma.gaWord.findUnique({ where: { id: data.linkedWordId }, select: { id: true } });
    if (!word) throw new Error("Linked Ga word was not found.");
  }
  if (data.linkedLessonId) {
    const lesson = await prisma.gaLesson.findUnique({ where: { id: data.linkedLessonId }, select: { id: true } });
    if (!lesson) throw new Error("Linked Ga lesson was not found.");
  }

  const reference = await prisma.gaPronunciationReference.create({
    data: {
      ...data,
      createdById: optionalText(actorUserId),
    },
  });

  await writeGaAudioAuditLog({
    referenceId: reference.id,
    action: "created",
    newStatus: reference.reviewStatus,
    performedById: actorUserId,
    notes: reference.pronunciationNote,
  });

  return reference;
}

export async function listGaPronunciationReferences(limit = 50) {
  return prisma.gaPronunciationReference.findMany({
    include: {
      linkedWord: { select: { id: true, englishWord: true, gaWord: true } },
      linkedLesson: { select: { id: true, title: true, slug: true } },
      createdBy: { select: { id: true, email: true, name: true } },
      reviewedBy: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, limit)),
  });
}

export async function listGaStudentRecordings(limit = 50, reviewStatus?: string | null) {
  const requestedReviewStatus = optionalText(reviewStatus);
  const normalizedReviewStatus = requestedReviewStatus
    ? assertAllowed(requestedReviewStatus, RECORDING_REVIEW_STATUSES, "Recording review status")
    : undefined;

  return prisma.gaStudentRecording.findMany({
    where: {
      reviewStatus: normalizedReviewStatus,
    },
    include: {
      student: { select: { id: true, name: true, parentId: true } },
      word: { select: { id: true, englishWord: true, gaWord: true } },
      lesson: { select: { id: true, title: true, slug: true } },
      reviewedBy: { select: { id: true, email: true, name: true } },
    },
    orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(200, limit)),
  });
}

export async function reviewGaStudentRecording(input: GaStudentRecordingReviewInput, actorUserId?: string | null) {
  const recordingId = cleanText(input.recordingId);
  if (!recordingId) throw new Error("Recording id is required.");
  const nextStatus = assertAllowed(cleanText(input.reviewStatus), RECORDING_REVIEW_STATUSES, "Recording review status");
  const current = await prisma.gaStudentRecording.findUnique({ where: { id: recordingId } });
  if (!current) return null;

  const updated = await prisma.gaStudentRecording.update({
    where: { id: recordingId },
    data: {
      reviewStatus: nextStatus,
      adminFeedback: optionalText(input.adminFeedback) ?? buildSupportiveFeedbackSummary(nextStatus),
      reviewedAt: new Date(),
      reviewedById: optionalText(actorUserId),
    },
  });

  await writeGaAudioAuditLog({
    studentRecordingId: updated.id,
    action: "reviewed",
    oldStatus: current.reviewStatus,
    newStatus: updated.reviewStatus,
    performedById: actorUserId,
    notes: updated.adminFeedback,
  });

  return prisma.gaStudentRecording.findUnique({
    where: { id: updated.id },
    include: {
      student: { select: { id: true, name: true, parentId: true } },
      word: { select: { id: true, englishWord: true, gaWord: true } },
      lesson: { select: { id: true, title: true, slug: true } },
      reviewedBy: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function createGaSongLesson(input: GaSongLessonInput, actorUserId?: string | null) {
  const title = cleanText(input.title);
  const level = cleanText(input.level);
  const category = cleanText(input.category);
  const lyricsGa = cleanText(input.lyricsGa);
  if (!title) throw new Error("Song title is required.");
  if (!level) throw new Error("Song level is required.");
  if (!category) throw new Error("Song category is required.");
  if (!lyricsGa) throw new Error("Ga lyrics are required.");

  const requestedWordIds = [...new Set((input.wordIdsUsed ?? []).map(cleanText).filter(Boolean))];
  const approvedWords = requestedWordIds.length
    ? await prisma.gaWord.findMany({ where: { id: { in: requestedWordIds } }, select: { id: true, reviewStatus: true } })
    : [];
  const approvedById = new Set(approvedWords.filter((word) => word.reviewStatus === "Approved").map((word) => word.id));
  const unapprovedWordsFlagged = requestedWordIds.filter((wordId) => !approvedById.has(wordId));

  const normalizedSourceType = optionalText(input.sourceType)
    ? assertAllowed(cleanText(input.sourceType), GA_AUDIO_SOURCE_TYPES, "Song source type")
    : null;

  const song = await prisma.gaSongLesson.create({
    data: {
      title,
      level,
      category,
      lyricsGa,
      lyricsEnglish: optionalText(input.lyricsEnglish),
      wordIdsUsed: requestedWordIds,
      unapprovedWordsFlagged,
      sourceType: normalizedSourceType,
      reviewStatus: normalizedSourceType === "AI_GENERATED_SONG" ? "AI_GENERATED" : "DRAFT",
      createdById: optionalText(actorUserId),
    },
  });

  await writeGaAudioAuditLog({
    action: "created",
    notes: `song:${song.id}`,
    performedById: actorUserId,
    newStatus: song.reviewStatus,
  });

  return getGaSongLessonById(song.id);
}

export async function listGaSongLessons(limit = 50) {
  return prisma.gaSongLesson.findMany({
    include: {
      currentAudioAsset: true,
      createdBy: { select: { id: true, email: true, name: true } },
      approvedBy: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, limit)),
  });
}

export async function getGaSongLessonById(id: string) {
  return prisma.gaSongLesson.findUnique({
    where: { id },
    include: {
      currentAudioAsset: true,
      audioAssets: true,
      createdBy: { select: { id: true, email: true, name: true } },
      approvedBy: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function approveGaSongLesson(songId: string, actorUserId?: string | null) {
  const normalizedId = cleanText(songId);
  if (!normalizedId) throw new Error("Song id is required.");
  const current = await prisma.gaSongLesson.findUnique({
    where: { id: normalizedId },
    include: { currentAudioAsset: true },
  });
  if (!current) return null;
  if (current.unapprovedWordsFlagged.length) {
    throw new Error("Songs with unapproved linked words cannot be approved.");
  }
  if (!current.currentAudioAsset) {
    throw new Error("Song must have a linked approved audio asset before student-safe approval.");
  }
  if (!isStudentFacingGaAudio(current.currentAudioAsset.reviewStatus, current.currentAudioAsset.approvalStatus)) {
    throw new Error("Linked song audio is not student-safe yet. Approve audio as APPROVED_FOR_EARLY_LEARNING, NEEDS_NATIVE_REVIEW, or NATIVE_VERIFIED first.");
  }

  const updated = await prisma.gaSongLesson.update({
    where: { id: normalizedId },
    data: {
      reviewStatus: "APPROVED_FOR_EARLY_LEARNING",
      approvedById: optionalText(actorUserId),
      approvedAt: new Date(),
    },
  });

  await writeGaAudioAuditLog({
    action: "approved",
    oldStatus: current.reviewStatus,
    newStatus: updated.reviewStatus,
    notes: `song:${updated.id}`,
    performedById: actorUserId,
  });

  return getGaSongLessonById(updated.id);
}

export function getGaSongAudioReadiness(song: {
  unapprovedWordsFlagged?: string[];
  currentAudioAsset?: { approvalStatus: string; reviewStatus: string } | null;
  reviewStatus: string;
}): "UNAPPROVED_WORDS" | "MISSING_AUDIO" | "AUDIO_NOT_STUDENT_SAFE" | "READY_FOR_APPROVAL" | "APPROVED" {
  if ((song.unapprovedWordsFlagged ?? []).length > 0) return "UNAPPROVED_WORDS";
  if (song.reviewStatus === "APPROVED_FOR_EARLY_LEARNING" || song.reviewStatus === "NEEDS_NATIVE_REVIEW" || song.reviewStatus === "NATIVE_VERIFIED") {
    return "APPROVED";
  }
  if (!song.currentAudioAsset) return "MISSING_AUDIO";
  if (!isStudentFacingGaAudio(song.currentAudioAsset.reviewStatus, song.currentAudioAsset.approvalStatus)) {
    return "AUDIO_NOT_STUDENT_SAFE";
  }
  return "READY_FOR_APPROVAL";
}

export async function rejectGaSongLesson(songId: string, actorUserId?: string | null, notes?: string | null) {
  const normalizedId = cleanText(songId);
  if (!normalizedId) throw new Error("Song id is required.");
  const current = await prisma.gaSongLesson.findUnique({ where: { id: normalizedId } });
  if (!current) return null;

  const updated = await prisma.gaSongLesson.update({
    where: { id: normalizedId },
    data: {
      reviewStatus: "REJECTED",
      approvedById: null,
      approvedAt: null,
    },
  });

  await writeGaAudioAuditLog({
    action: "rejected",
    oldStatus: current.reviewStatus,
    newStatus: updated.reviewStatus,
    notes: optionalText(notes) ?? `song:${updated.id}`,
    performedById: actorUserId,
  });

  return getGaSongLessonById(updated.id);
}

export async function getGaAudioAssetById(id: string) {
  return prisma.gaAudioAsset.findUnique({
    where: { id },
    include: {
      word: true,
      lesson: true,
      song: true,
      createdBy: { select: { id: true, email: true, name: true } },
      approvedBy: { select: { id: true, email: true, name: true } },
      rejectedBy: { select: { id: true, email: true, name: true } },
      deletedBy: { select: { id: true, email: true, name: true } },
      replacedByAudio: true,
      replacedAssets: {
        orderBy: { createdAt: "desc" },
      },
      currentForSong: { select: { id: true, title: true } },
    },
  });
}

export async function listGaAudioAuditTrail(filters: {
  audioAssetId?: string | null;
  referenceId?: string | null;
  studentRecordingId?: string | null;
  limit?: number | null;
}) {
  return prisma.gaAudioAuditLog.findMany({
    where: {
      audioAssetId: optionalText(filters.audioAssetId) ?? undefined,
      referenceId: optionalText(filters.referenceId) ?? undefined,
      studentRecordingId: optionalText(filters.studentRecordingId) ?? undefined,
    },
    include: {
      audioAsset: { select: { id: true, audioUrl: true, sourceType: true, reviewStatus: true, approvalStatus: true } },
      reference: { select: { id: true, sourceUrl: true, referenceType: true, reviewStatus: true } },
      studentRecording: { select: { id: true, audioUrl: true, reviewStatus: true } },
      performedBy: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(200, Number(filters.limit ?? 50))),
  });
}

export async function getGaAudioDashboardMetrics() {
  const [
    totalAudioAssets,
    aiGeneratedFiles,
    approvedForEarlyLearning,
    needsNativeReview,
    nativeVerified,
    rejectedAudio,
    approvedWords,
    wordsMissingAudio,
    lessonsCount,
    lessonsMissingAudio,
    studentRecordingsAwaitingReview,
    songsPendingApproval,
  ] = await Promise.all([
    prisma.gaAudioAsset.count(),
    prisma.gaAudioAsset.count({ where: { deletedAt: null, sourceType: { in: ["AI_GENERATED", "AI_GENERATED_SONG"] } } }),
    prisma.gaAudioAsset.count({ where: { deletedAt: null, approvalStatus: "APPROVED", reviewStatus: "APPROVED_FOR_EARLY_LEARNING" } }),
    prisma.gaAudioAsset.count({ where: { deletedAt: null, approvalStatus: "APPROVED", reviewStatus: "NEEDS_NATIVE_REVIEW" } }),
    prisma.gaAudioAsset.count({ where: { deletedAt: null, approvalStatus: "APPROVED", reviewStatus: "NATIVE_VERIFIED" } }),
    prisma.gaAudioAsset.count({ where: { deletedAt: null, approvalStatus: "REJECTED" } }),
    prisma.gaWord.count({ where: { reviewStatus: "Approved" } }),
    prisma.gaWord.count({
      where: {
        reviewStatus: "Approved",
        audioAssets: {
          none: {
            deletedAt: null,
            approvalStatus: "APPROVED",
            reviewStatus: { in: [...POSITIVE_AUDIO_REVIEW_STATUSES] },
          },
        },
      },
    }),
    prisma.gaLesson.count(),
    prisma.gaLesson.count({
      where: {
        publishStatus: "Published",
        audioAssets: {
          none: {
            deletedAt: null,
            approvalStatus: "APPROVED",
            reviewStatus: { in: [...POSITIVE_AUDIO_REVIEW_STATUSES] },
          },
        },
      },
    }),
    prisma.gaStudentRecording.count({ where: { reviewStatus: "PENDING" } }),
    prisma.gaSongLesson.count({ where: { reviewStatus: { in: ["DRAFT", "AI_GENERATED"] } } }),
  ]);

  return {
    totalAudioAssets,
    aiGeneratedFiles,
    approvedForEarlyLearning,
    needsNativeReview,
    nativeVerified,
    rejectedAudio,
    approvedWords,
    wordsMissingAudio,
    lessonsCount,
    lessonAudioMissing: lessonsMissingAudio,
    studentRecordingsAwaitingReview,
    songsPendingApproval,
    approvedAudioWords: approvedForEarlyLearning + needsNativeReview + nativeVerified,
    pendingAudioWords: wordsMissingAudio,
    reviewedAt: new Date().toISOString(),
  };
}

export function isGaAudioSchemaNotReadyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return ["GaAudioAsset", "GaPronunciationReference", "GaStudentRecording", "GaSongLesson", "GaAudioAuditLog"].some((token) => message.includes(token));
}

export function serializeGaAudioAsset<T extends { createdAt: Date; updatedAt: Date; approvedAt: Date | null; rejectedAt: Date | null }>(asset: T) {
  const deletedAt = "deletedAt" in asset ? (asset as T & { deletedAt?: Date | null }).deletedAt ?? null : null;
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    approvedAt: asset.approvedAt ? asset.approvedAt.toISOString() : null,
    rejectedAt: asset.rejectedAt ? asset.rejectedAt.toISOString() : null,
    deletedAt: deletedAt ? deletedAt.toISOString() : null,
  };
}

export function serializeGaAudioAudit<T extends { createdAt: Date }>(entry: T) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function serializeGaPronunciationReference<T extends { createdAt: Date; updatedAt: Date }>(reference: T) {
  return {
    ...reference,
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
}

export function serializeGaStudentRecording<T extends { createdAt: Date; reviewedAt: Date | null }>(recording: T) {
  return {
    ...recording,
    createdAt: recording.createdAt.toISOString(),
    reviewedAt: recording.reviewedAt ? recording.reviewedAt.toISOString() : null,
  };
}

export function serializeGaSongLesson<T extends { createdAt: Date; updatedAt: Date; approvedAt: Date | null }>(song: T) {
  return {
    ...song,
    createdAt: song.createdAt.toISOString(),
    updatedAt: song.updatedAt.toISOString(),
    approvedAt: song.approvedAt ? song.approvedAt.toISOString() : null,
  };
}

export function buildSupportiveFeedbackSummary(reviewStatus: string): string {
  const normalized = assertAllowed(cleanText(reviewStatus) || "PENDING", RECORDING_REVIEW_STATUSES, "Recording review status");
  if (normalized === "REVIEWED") return "Good attempt";
  if (normalized === "NEEDS_REPEAT") return "Try listening again and practise the first sound.";
  if (normalized === "FLAGGED") return "Ask your teacher or admin to review this one.";
  return "Good effort. Keep practising.";
}

export function isStudentFacingGaAudio(reviewStatus: string, approvalStatus: string): boolean {
  return approvalStatus === "APPROVED" && canServeGaAudioToStudent(reviewStatus);
}
