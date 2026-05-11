-- CreateEnum
CREATE TYPE "public"."PricingInterval" AS ENUM ('month', 'year', 'custom');

-- CreateEnum
CREATE TYPE "public"."PricingAudience" AS ENUM ('individual', 'family', 'school', 'organisation');

-- CreateEnum
CREATE TYPE "public"."SchoolStatus" AS ENUM ('pilot', 'active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "public"."SchoolTeacherStatus" AS ENUM ('invited', 'active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "public"."SchoolTeacherRole" AS ENUM ('owner', 'admin', 'teacher', 'support', 'staff_observer', 'finance');

-- CreateEnum
CREATE TYPE "public"."SchoolStudentStatus" AS ENUM ('active', 'archived', 'transferred');

-- CreateEnum
CREATE TYPE "public"."SchoolBillingInterval" AS ENUM ('month', 'year', 'custom');

-- CreateEnum
CREATE TYPE "public"."SchoolInviteType" AS ENUM ('teacher', 'school_admin', 'parent');

-- CreateEnum
CREATE TYPE "public"."AdminPermission" AS ENUM ('MANAGE_USERS', 'MANAGE_ADMINS', 'MANAGE_ROLES', 'VIEW_AUDIT_LOGS', 'MANAGE_CONTENT', 'APPROVE_CONTENT', 'MANAGE_ASSIGNMENTS', 'VIEW_PROGRESS', 'MANAGE_BILLING', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_INTEGRATIONS', 'MANAGE_API_KEYS', 'MANAGE_SETTINGS', 'MANAGE_BRANDING', 'MANAGE_SECURITY', 'VIEW_REPORTS', 'EXPORT_DATA', 'ARCHIVE_RECORDS', 'DELETE_RECORDS', 'MANAGE_INBOX');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'parent',
    "trialSessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "pinHash" TEXT,
    "activeChildId" TEXT,
    "consentVersion" TEXT,
    "consentAcceptedAt" TIMESTAMP(3),
    "consentWithdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChildProfile" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "age" INTEGER,
    "yearGroup" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "selectedVoice" TEXT NOT NULL DEFAULT 'friendly_coach',
    "selectedTheme" TEXT NOT NULL DEFAULT 'default',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "snapshotJson" TEXT,
    "coachingMemoryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgressRecord" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "starsEarned" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "correct" BOOLEAN,
    "difficulty" INTEGER,
    "notes" TEXT,
    "accuracy" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuestionHistory" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answeredCorrectly" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RewardItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "unlockLevel" INTEGER NOT NULL DEFAULT 1,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIContentCache" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "contentJson" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "model" TEXT,
    "prompt" TEXT,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "skillFocus" TEXT,
    "skills" TEXT,
    "metadataJson" TEXT,
    "estimatedCostPence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AIContentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WordProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "pattern" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'seen',
    "mistakeType" TEXT,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKeyConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "lastTestedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKeyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIpAddress" TEXT,
    "lastLoginUserAgent" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedReason" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "deletionRequester" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeleteApproval" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestIpAddress" TEXT,
    "requestUserAgent" TEXT,
    "approvalIpAddress" TEXT,
    "approvalUserAgent" TEXT,
    "denialReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeleteApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerCustomerId" TEXT,
    "providerSubId" TEXT,
    "pricingPlanId" TEXT,
    "planKey" TEXT NOT NULL DEFAULT 'trial',
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "public"."SchoolStatus" NOT NULL DEFAULT 'pilot',
    "type" TEXT NOT NULL DEFAULT 'school',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressJson" TEXT,
    "notes" TEXT,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionFamilyId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Classroom" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "academicYear" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolTeacher" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."SchoolTeacherRole" NOT NULL DEFAULT 'teacher',
    "status" "public"."SchoolTeacherStatus" NOT NULL DEFAULT 'invited',
    "title" TEXT,
    "invitedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolStudent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "classroomId" TEXT,
    "status" "public"."SchoolStudentStatus" NOT NULL DEFAULT 'active',
    "externalRef" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolLicence" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "pricingPlanId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pilot',
    "seatLimit" INTEGER NOT NULL DEFAULT 0,
    "seatPricePence" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "billingInterval" "public"."SchoolBillingInterval" NOT NULL DEFAULT 'custom',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolLicence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "interval" "public"."PricingInterval" NOT NULL,
    "audience" "public"."PricingAudience" NOT NULL,
    "features" JSONB NOT NULL,
    "priceNote" TEXT,
    "badge" TEXT,
    "ctaLabel" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "ageGroup" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contentRefs" TEXT,
    "skills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RewardRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "requiredLevel" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WalletTransaction" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "itemId" TEXT,
    "reason" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportTicket" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MediaAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobRunLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WeakArea" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "skillFocus" TEXT NOT NULL,
    "weaknessType" TEXT NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "attemptsCount" INTEGER NOT NULL,
    "currentDifficulty" INTEGER NOT NULL DEFAULT 1,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeakArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Assignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "spellingMode" TEXT,
    "keyStage" TEXT,
    "yearGroup" TEXT,
    "skillFocus" TEXT NOT NULL,
    "contentId" TEXT,
    "assignmentId" TEXT,
    "questionText" TEXT,
    "answerGiven" TEXT,
    "correctAnswer" TEXT,
    "correct" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL,
    "skills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChildReward" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentSkill" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'weak',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BrandingSettings" (
    "id" TEXT NOT NULL,
    "siteName" TEXT NOT NULL DEFAULT 'StarLiz Academy',
    "tagline" TEXT NOT NULL DEFAULT 'Learn • Grow • Shine',
    "logoUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "iconUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "faviconUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutlookToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "microsoftUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutlookToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GeneralSettings" (
    "id" TEXT NOT NULL,
    "appName" TEXT NOT NULL DEFAULT 'StarLiz Academy',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SecuritySettings" (
    "id" TEXT NOT NULL,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumber" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecial" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutHours" INTEGER NOT NULL DEFAULT 24,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIAdaptationSettings" (
    "id" TEXT NOT NULL,
    "frustrationThreshold" INTEGER NOT NULL DEFAULT 3,
    "lowConfidenceThreshold" INTEGER NOT NULL DEFAULT 40,
    "adaptationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "warmupRequired" BOOLEAN NOT NULL DEFAULT true,
    "shortSessionMins" INTEGER NOT NULL DEFAULT 5,
    "normalSessionMins" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAdaptationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminEmail" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "messageId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParentMessageThread" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "contactAddress" TEXT NOT NULL,
    "contactLabel" TEXT,
    "parentId" TEXT,
    "parentEmail" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentMessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParentMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "providerSid" TEXT,
    "providerStatus" TEXT,
    "mediaUrlsJson" TEXT,
    "actorUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeacherInviteToken" (
    "id" TEXT NOT NULL,
    "schoolTeacherId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "resentAt" TIMESTAMP(3),
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolInviteToken" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "inviteType" "public"."SchoolInviteType" NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "targetRole" TEXT,
    "targetSchoolStudentId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "consumedByUserId" TEXT,
    "createdByUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolInviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "source" TEXT,
    "operation" TEXT,
    "actorType" TEXT,
    "actorAdminUserId" TEXT,
    "actorSchoolTeacherId" TEXT,
    "actorEmail" TEXT,
    "impersonatedByUserId" TEXT,
    "metadataJson" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "diffJson" TEXT,
    "tagsJson" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolLoginHistory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolLoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolAccessLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolTeacherId" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "denialReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LicenceEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolLicenceId" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "actorUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParentSchoolLink" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "schoolStudentId" TEXT NOT NULL,
    "canReceiveReports" BOOLEAN NOT NULL DEFAULT true,
    "canMessageTeachers" BOOLEAN NOT NULL DEFAULT true,
    "consentGivenAt" TIMESTAMP(3),
    "consentWithdrawnAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentSchoolLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolCommunicationPreference" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentSchoolLinkId" TEXT NOT NULL,
    "optedOutAt" TIMESTAMP(3),
    "optOutReason" TEXT,
    "safeguardingLockedAt" TIMESTAMP(3),
    "safeguardingLockReason" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolCommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolCommunicationLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentSchoolLinkId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "messageBody" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL,
    "deliveryReason" TEXT,
    "safeguardingOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolCommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolSafeguardingAlert" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "contentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSafeguardingAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SafeguardingIncident" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "reportedByUserId" TEXT,
    "escalationOwnerUserId" TEXT,
    "escalationLevel" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SafeguardingIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SafeguardingWorkflowEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "note" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeguardingWorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SafeguardingEvidenceAttachment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "label" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeguardingEvidenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolProvisioningJob" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "idempotencyKey" TEXT NOT NULL,
    "requestJson" TEXT,
    "resultJson" TEXT,
    "errorJson" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolProvisioningStepRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "actorUserId" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorJson" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolProvisioningStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Trust" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "headquartersRegion" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trust_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrustSchoolMembership" (
    "id" TEXT NOT NULL,
    "trustId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "roleInTrust" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustSchoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrustAdminMembership" (
    "id" TEXT NOT NULL,
    "trustId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trustRole" TEXT NOT NULL DEFAULT 'viewer',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustAdminMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BulkOnboardingBatch" (
    "id" TEXT NOT NULL,
    "trustId" TEXT,
    "createdByUserId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'csv',
    "fileRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkOnboardingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BulkOnboardingItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "schoolPayloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdSchoolId" TEXT,
    "errorJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkOnboardingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schoolId" TEXT,
    "trustId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payloadJson" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "providerStatus" TEXT,
    "lastError" TEXT,
    "deliveredByUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT,
    "trustId" TEXT,
    "eventType" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minSeverity" TEXT NOT NULL DEFAULT 'info',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "timezone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "public"."PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "public"."PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionHistory_childId_questionId_key" ON "public"."QuestionHistory"("childId", "questionId");

-- CreateIndex
CREATE INDEX "AIContentCache_contentType_level_idx" ON "public"."AIContentCache"("contentType", "level");

-- CreateIndex
CREATE INDEX "AIContentCache_status_idx" ON "public"."AIContentCache"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WordProgress_studentId_word_key" ON "public"."WordProgress"("studentId", "word");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyConfig_provider_key" ON "public"."ApiKeyConfig"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "sqlite_autoindex_AdminRole_2" ON "public"."AdminRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "public"."AdminUser"("userId");

-- CreateIndex
CREATE INDEX "AdminUser_active_idx" ON "public"."AdminUser"("active");

-- CreateIndex
CREATE INDEX "AdminUser_roleId_idx" ON "public"."AdminUser"("roleId");

-- CreateIndex
CREATE INDEX "DeleteApproval_targetUserId_status_idx" ON "public"."DeleteApproval"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "DeleteApproval_requestedByUserId_status_idx" ON "public"."DeleteApproval"("requestedByUserId", "status");

-- CreateIndex
CREATE INDEX "DeleteApproval_entityType_entityId_idx" ON "public"."DeleteApproval"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "DeleteApproval_status_expiresAt_idx" ON "public"."DeleteApproval"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "public"."AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "Subscription_parentId_idx" ON "public"."Subscription"("parentId");

-- CreateIndex
CREATE INDEX "Subscription_providerCustomerId_idx" ON "public"."Subscription"("providerCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_providerSubId_idx" ON "public"."Subscription"("providerSubId");

-- CreateIndex
CREATE INDEX "Subscription_pricingPlanId_idx" ON "public"."Subscription"("pricingPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "public"."School"("slug");

-- CreateIndex
CREATE INDEX "School_status_idx" ON "public"."School"("status");

-- CreateIndex
CREATE INDEX "School_ownerUserId_idx" ON "public"."School"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenId_key" ON "public"."AuthSession"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "public"."AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_createdAt_idx" ON "public"."AuthSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_sessionFamilyId_idx" ON "public"."AuthSession"("sessionFamilyId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "public"."AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_revokedAt_idx" ON "public"."AuthSession"("revokedAt");

-- CreateIndex
CREATE INDEX "Classroom_schoolId_status_idx" ON "public"."Classroom"("schoolId", "status");

-- CreateIndex
CREATE INDEX "Classroom_teacherId_idx" ON "public"."Classroom"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_schoolId_name_academicYear_key" ON "public"."Classroom"("schoolId", "name", "academicYear");

-- CreateIndex
CREATE INDEX "SchoolTeacher_schoolId_role_idx" ON "public"."SchoolTeacher"("schoolId", "role");

-- CreateIndex
CREATE INDEX "SchoolTeacher_userId_idx" ON "public"."SchoolTeacher"("userId");

-- CreateIndex
CREATE INDEX "SchoolTeacher_status_idx" ON "public"."SchoolTeacher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTeacher_schoolId_userId_key" ON "public"."SchoolTeacher"("schoolId", "userId");

-- CreateIndex
CREATE INDEX "SchoolStudent_schoolId_status_idx" ON "public"."SchoolStudent"("schoolId", "status");

-- CreateIndex
CREATE INDEX "SchoolStudent_classroomId_idx" ON "public"."SchoolStudent"("classroomId");

-- CreateIndex
CREATE INDEX "SchoolStudent_childId_idx" ON "public"."SchoolStudent"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_schoolId_childId_key" ON "public"."SchoolStudent"("schoolId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_schoolId_externalRef_key" ON "public"."SchoolStudent"("schoolId", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLicence_schoolId_key" ON "public"."SchoolLicence"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolLicence_status_idx" ON "public"."SchoolLicence"("status");

-- CreateIndex
CREATE INDEX "SchoolLicence_pricingPlanId_idx" ON "public"."SchoolLicence"("pricingPlanId");

-- CreateIndex
CREATE INDEX "SchoolLicence_providerCustomerId_idx" ON "public"."SchoolLicence"("providerCustomerId");

-- CreateIndex
CREATE INDEX "SchoolLicence_providerSubscriptionId_idx" ON "public"."SchoolLicence"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PricingPlan_isActive_sortOrder_idx" ON "public"."PricingPlan"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "WalletTransaction_childId_createdAt_idx" ON "public"."WalletTransaction"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_source_idx" ON "public"."WalletTransaction"("type", "source");

-- CreateIndex
CREATE INDEX "SupportTicket_parentId_idx" ON "public"."SupportTicket"("parentId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "public"."SupportTicket"("status");

-- CreateIndex
CREATE INDEX "JobRunLog_jobName_startedAt_idx" ON "public"."JobRunLog"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "JobRunLog_status_idx" ON "public"."JobRunLog"("status");

-- CreateIndex
CREATE INDEX "WeakArea_status_idx" ON "public"."WeakArea"("status");

-- CreateIndex
CREATE INDEX "WeakArea_subject_skillFocus_idx" ON "public"."WeakArea"("subject", "skillFocus");

-- CreateIndex
CREATE UNIQUE INDEX "WeakArea_studentId_subject_skillFocus_key" ON "public"."WeakArea"("studentId", "subject", "skillFocus");

-- CreateIndex
CREATE INDEX "Assignment_studentId_status_idx" ON "public"."Assignment"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_studentId_contentId_key" ON "public"."Assignment"("studentId", "contentId");

-- CreateIndex
CREATE INDEX "Attempt_studentId_subject_skillFocus_idx" ON "public"."Attempt"("studentId", "subject", "skillFocus");

-- CreateIndex
CREATE INDEX "Attempt_createdAt_idx" ON "public"."Attempt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChildReward_childId_rewardId_key" ON "public"."ChildReward"("childId", "rewardId");

-- CreateIndex
CREATE INDEX "StudentSkill_studentId_status_idx" ON "public"."StudentSkill"("studentId", "status");

-- CreateIndex
CREATE INDEX "StudentSkill_skill_idx" ON "public"."StudentSkill"("skill");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSkill_studentId_skill_key" ON "public"."StudentSkill"("studentId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "OutlookToken_adminUserId_key" ON "public"."OutlookToken"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminEmail_adminUserId_direction_idx" ON "public"."AdminEmail"("adminUserId", "direction");

-- CreateIndex
CREATE INDEX "AdminEmail_adminUserId_isRead_idx" ON "public"."AdminEmail"("adminUserId", "isRead");

-- CreateIndex
CREATE INDEX "ParentMessageThread_lastMessageAt_idx" ON "public"."ParentMessageThread"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParentMessageThread_channel_contactAddress_key" ON "public"."ParentMessageThread"("channel", "contactAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ParentMessage_providerSid_key" ON "public"."ParentMessage"("providerSid");

-- CreateIndex
CREATE INDEX "ParentMessage_threadId_createdAt_idx" ON "public"."ParentMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ParentMessage_direction_createdAt_idx" ON "public"."ParentMessage"("direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInviteToken_tokenHash_key" ON "public"."TeacherInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInviteToken_schoolTeacherId_idx" ON "public"."TeacherInviteToken"("schoolTeacherId");

-- CreateIndex
CREATE INDEX "TeacherInviteToken_expiresAt_idx" ON "public"."TeacherInviteToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInviteToken_tokenHash_key" ON "public"."SchoolInviteToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_schoolId_inviteType_idx" ON "public"."SchoolInviteToken"("schoolId", "inviteType");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_schoolId_targetEmail_idx" ON "public"."SchoolInviteToken"("schoolId", "targetEmail");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_expiresAt_idx" ON "public"."SchoolInviteToken"("expiresAt");

-- CreateIndex
CREATE INDEX "SchoolInviteToken_usedAt_idx" ON "public"."SchoolInviteToken"("usedAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_createdAt_idx" ON "public"."SchoolAuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_action_idx" ON "public"."SchoolAuditLog"("schoolId", "action");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_schoolId_operation_createdAt_idx" ON "public"."SchoolAuditLog"("schoolId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_entityType_entityId_idx" ON "public"."SchoolAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_correlationId_idx" ON "public"."SchoolAuditLog"("correlationId");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_actorUserId_createdAt_idx" ON "public"."SchoolAuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAuditLog_severity_createdAt_idx" ON "public"."SchoolAuditLog"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_schoolId_createdAt_idx" ON "public"."SchoolLoginHistory"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_userId_createdAt_idx" ON "public"."SchoolLoginHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolLoginHistory_success_createdAt_idx" ON "public"."SchoolLoginHistory"("success", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_schoolId_createdAt_idx" ON "public"."SchoolAccessLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_userId_createdAt_idx" ON "public"."SchoolAccessLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_schoolTeacherId_createdAt_idx" ON "public"."SchoolAccessLog"("schoolTeacherId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolAccessLog_success_createdAt_idx" ON "public"."SchoolAccessLog"("success", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_schoolId_createdAt_idx" ON "public"."LicenceEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_schoolLicenceId_createdAt_idx" ON "public"."LicenceEvent"("schoolLicenceId", "createdAt");

-- CreateIndex
CREATE INDEX "LicenceEvent_eventType_createdAt_idx" ON "public"."LicenceEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_schoolId_status_idx" ON "public"."ParentSchoolLink"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_parentUserId_idx" ON "public"."ParentSchoolLink"("parentUserId");

-- CreateIndex
CREATE INDEX "ParentSchoolLink_schoolStudentId_idx" ON "public"."ParentSchoolLink"("schoolStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentSchoolLink_schoolId_parentUserId_schoolStudentId_key" ON "public"."ParentSchoolLink"("schoolId", "parentUserId", "schoolStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolCommunicationPreference_parentSchoolLinkId_key" ON "public"."SchoolCommunicationPreference"("parentSchoolLinkId");

-- CreateIndex
CREATE INDEX "SchoolCommunicationPreference_schoolId_updatedAt_idx" ON "public"."SchoolCommunicationPreference"("schoolId", "updatedAt");

-- CreateIndex
CREATE INDEX "SchoolCommunicationPreference_optedOutAt_idx" ON "public"."SchoolCommunicationPreference"("optedOutAt");

-- CreateIndex
CREATE INDEX "SchoolCommunicationPreference_safeguardingLockedAt_idx" ON "public"."SchoolCommunicationPreference"("safeguardingLockedAt");

-- CreateIndex
CREATE INDEX "SchoolCommunicationLog_schoolId_createdAt_idx" ON "public"."SchoolCommunicationLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolCommunicationLog_parentSchoolLinkId_createdAt_idx" ON "public"."SchoolCommunicationLog"("parentSchoolLinkId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolCommunicationLog_deliveryStatus_createdAt_idx" ON "public"."SchoolCommunicationLog"("deliveryStatus", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_schoolId_status_idx" ON "public"."SchoolSafeguardingAlert"("schoolId", "status");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_schoolId_severity_idx" ON "public"."SchoolSafeguardingAlert"("schoolId", "severity");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_studentId_idx" ON "public"."SchoolSafeguardingAlert"("studentId");

-- CreateIndex
CREATE INDEX "SchoolSafeguardingAlert_createdAt_idx" ON "public"."SchoolSafeguardingAlert"("createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_schoolId_status_idx" ON "public"."SafeguardingIncident"("schoolId", "status");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_schoolId_severity_idx" ON "public"."SafeguardingIncident"("schoolId", "severity");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_studentId_createdAt_idx" ON "public"."SafeguardingIncident"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_reportedByUserId_createdAt_idx" ON "public"."SafeguardingIncident"("reportedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingIncident_escalationOwnerUserId_createdAt_idx" ON "public"."SafeguardingIncident"("escalationOwnerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingWorkflowEvent_schoolId_createdAt_idx" ON "public"."SafeguardingWorkflowEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingWorkflowEvent_incidentId_createdAt_idx" ON "public"."SafeguardingWorkflowEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingWorkflowEvent_eventType_createdAt_idx" ON "public"."SafeguardingWorkflowEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingEvidenceAttachment_schoolId_createdAt_idx" ON "public"."SafeguardingEvidenceAttachment"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SafeguardingEvidenceAttachment_incidentId_createdAt_idx" ON "public"."SafeguardingEvidenceAttachment"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolProvisioningJob_idempotencyKey_key" ON "public"."SchoolProvisioningJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_schoolId_createdAt_idx" ON "public"."SchoolProvisioningJob"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_status_createdAt_idx" ON "public"."SchoolProvisioningJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningJob_nextRetryAt_status_idx" ON "public"."SchoolProvisioningJob"("nextRetryAt", "status");

-- CreateIndex
CREATE INDEX "SchoolProvisioningStepRun_jobId_createdAt_idx" ON "public"."SchoolProvisioningStepRun"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolProvisioningStepRun_stepKey_status_idx" ON "public"."SchoolProvisioningStepRun"("stepKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trust_code_key" ON "public"."Trust"("code");

-- CreateIndex
CREATE INDEX "Trust_status_createdAt_idx" ON "public"."Trust"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TrustSchoolMembership_schoolId_status_idx" ON "public"."TrustSchoolMembership"("schoolId", "status");

-- CreateIndex
CREATE INDEX "TrustSchoolMembership_trustId_status_idx" ON "public"."TrustSchoolMembership"("trustId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrustSchoolMembership_trustId_schoolId_key" ON "public"."TrustSchoolMembership"("trustId", "schoolId");

-- CreateIndex
CREATE INDEX "TrustAdminMembership_userId_status_idx" ON "public"."TrustAdminMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "TrustAdminMembership_trustId_status_idx" ON "public"."TrustAdminMembership"("trustId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrustAdminMembership_trustId_userId_key" ON "public"."TrustAdminMembership"("trustId", "userId");

-- CreateIndex
CREATE INDEX "BulkOnboardingBatch_status_createdAt_idx" ON "public"."BulkOnboardingBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingBatch_trustId_createdAt_idx" ON "public"."BulkOnboardingBatch"("trustId", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingItem_status_createdAt_idx" ON "public"."BulkOnboardingItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOnboardingItem_createdSchoolId_idx" ON "public"."BulkOnboardingItem"("createdSchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "BulkOnboardingItem_batchId_rowNumber_key" ON "public"."BulkOnboardingItem"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_createdAt_idx" ON "public"."NotificationEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_schoolId_createdAt_idx" ON "public"."NotificationEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_trustId_createdAt_idx" ON "public"."NotificationEvent"("trustId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_status_createdAt_idx" ON "public"."NotificationEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_dedupeKey_idx" ON "public"."NotificationEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_eventId_createdAt_idx" ON "public"."NotificationDelivery"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_createdAt_idx" ON "public"."NotificationDelivery"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipient_createdAt_idx" ON "public"."NotificationDelivery"("recipient", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_createdAt_idx" ON "public"."NotificationPreference"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_schoolId_userId_idx" ON "public"."NotificationPreference"("schoolId", "userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_trustId_userId_idx" ON "public"."NotificationPreference"("trustId", "userId");

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChildProfile" ADD CONSTRAINT "ChildProfile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgressRecord" ADD CONSTRAINT "ProgressRecord_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionHistory" ADD CONSTRAINT "QuestionHistory_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminUser" ADD CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeleteApproval" ADD CONSTRAINT "DeleteApproval_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeleteApproval" ADD CONSTRAINT "DeleteApproval_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeleteApproval" ADD CONSTRAINT "DeleteApproval_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."School" ADD CONSTRAINT "School_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Classroom" ADD CONSTRAINT "Classroom_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."SchoolTeacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolTeacher" ADD CONSTRAINT "SchoolTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolTeacher" ADD CONSTRAINT "SchoolTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolStudent" ADD CONSTRAINT "SchoolStudent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolStudent" ADD CONSTRAINT "SchoolStudent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolStudent" ADD CONSTRAINT "SchoolStudent_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "public"."Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolLicence" ADD CONSTRAINT "SchoolLicence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletTransaction" ADD CONSTRAINT "WalletTransaction_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeakArea" ADD CONSTRAINT "WeakArea_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."AIContentCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attempt" ADD CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChildReward" ADD CONSTRAINT "ChildReward_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChildReward" ADD CONSTRAINT "ChildReward_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "public"."RewardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentSkill" ADD CONSTRAINT "StudentSkill_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentMessage" ADD CONSTRAINT "ParentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ParentMessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherInviteToken" ADD CONSTRAINT "TeacherInviteToken_schoolTeacherId_fkey" FOREIGN KEY ("schoolTeacherId") REFERENCES "public"."SchoolTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolInviteToken" ADD CONSTRAINT "SchoolInviteToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolInviteToken" ADD CONSTRAINT "SchoolInviteToken_consumedByUserId_fkey" FOREIGN KEY ("consumedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolInviteToken" ADD CONSTRAINT "SchoolInviteToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolAuditLog" ADD CONSTRAINT "SchoolAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolLoginHistory" ADD CONSTRAINT "SchoolLoginHistory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolLoginHistory" ADD CONSTRAINT "SchoolLoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolAccessLog" ADD CONSTRAINT "SchoolAccessLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolAccessLog" ADD CONSTRAINT "SchoolAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LicenceEvent" ADD CONSTRAINT "LicenceEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LicenceEvent" ADD CONSTRAINT "LicenceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentSchoolLink" ADD CONSTRAINT "ParentSchoolLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentSchoolLink" ADD CONSTRAINT "ParentSchoolLink_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentSchoolLink" ADD CONSTRAINT "ParentSchoolLink_schoolStudentId_fkey" FOREIGN KEY ("schoolStudentId") REFERENCES "public"."SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationPreference" ADD CONSTRAINT "SchoolCommunicationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationPreference" ADD CONSTRAINT "SchoolCommunicationPreference_parentSchoolLinkId_fkey" FOREIGN KEY ("parentSchoolLinkId") REFERENCES "public"."ParentSchoolLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationPreference" ADD CONSTRAINT "SchoolCommunicationPreference_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationLog" ADD CONSTRAINT "SchoolCommunicationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationLog" ADD CONSTRAINT "SchoolCommunicationLog_parentSchoolLinkId_fkey" FOREIGN KEY ("parentSchoolLinkId") REFERENCES "public"."ParentSchoolLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolCommunicationLog" ADD CONSTRAINT "SchoolCommunicationLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolSafeguardingAlert" ADD CONSTRAINT "SchoolSafeguardingAlert_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolSafeguardingAlert" ADD CONSTRAINT "SchoolSafeguardingAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingIncident" ADD CONSTRAINT "SafeguardingIncident_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingIncident" ADD CONSTRAINT "SafeguardingIncident_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingIncident" ADD CONSTRAINT "SafeguardingIncident_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingIncident" ADD CONSTRAINT "SafeguardingIncident_escalationOwnerUserId_fkey" FOREIGN KEY ("escalationOwnerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingWorkflowEvent" ADD CONSTRAINT "SafeguardingWorkflowEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingWorkflowEvent" ADD CONSTRAINT "SafeguardingWorkflowEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."SafeguardingIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingWorkflowEvent" ADD CONSTRAINT "SafeguardingWorkflowEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingEvidenceAttachment" ADD CONSTRAINT "SafeguardingEvidenceAttachment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingEvidenceAttachment" ADD CONSTRAINT "SafeguardingEvidenceAttachment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."SafeguardingIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SafeguardingEvidenceAttachment" ADD CONSTRAINT "SafeguardingEvidenceAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolProvisioningJob" ADD CONSTRAINT "SchoolProvisioningJob_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolProvisioningJob" ADD CONSTRAINT "SchoolProvisioningJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolProvisioningStepRun" ADD CONSTRAINT "SchoolProvisioningStepRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."SchoolProvisioningJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolProvisioningStepRun" ADD CONSTRAINT "SchoolProvisioningStepRun_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrustSchoolMembership" ADD CONSTRAINT "TrustSchoolMembership_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "public"."Trust"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrustSchoolMembership" ADD CONSTRAINT "TrustSchoolMembership_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrustAdminMembership" ADD CONSTRAINT "TrustAdminMembership_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "public"."Trust"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrustAdminMembership" ADD CONSTRAINT "TrustAdminMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BulkOnboardingBatch" ADD CONSTRAINT "BulkOnboardingBatch_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "public"."Trust"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BulkOnboardingItem" ADD CONSTRAINT "BulkOnboardingItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."BulkOnboardingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationEvent" ADD CONSTRAINT "NotificationEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationEvent" ADD CONSTRAINT "NotificationEvent_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "public"."Trust"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_trustId_fkey" FOREIGN KEY ("trustId") REFERENCES "public"."Trust"("id") ON DELETE CASCADE ON UPDATE CASCADE;
