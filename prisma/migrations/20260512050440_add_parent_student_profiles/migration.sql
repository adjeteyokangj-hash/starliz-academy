-- CreateTable
CREATE TABLE "public"."ParentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "address" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "parentRole" TEXT DEFAULT 'parent',
    "status" TEXT NOT NULL DEFAULT 'active',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "smsConsent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
    "emailConsent" BOOLEAN NOT NULL DEFAULT false,
    "numberOfChildren" INTEGER,
    "preferredLearningFocus" TEXT,
    "schoolType" TEXT,
    "curriculum" TEXT,
    "trialStatus" TEXT DEFAULT 'none',
    "subscriptionPlan" TEXT,
    "stripeCustomerId" TEXT,
    "paystackCustomerId" TEXT,
    "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "deviceTrackingJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudentProfile" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "keyStageLevel" TEXT,
    "learningLevel" TEXT,
    "senSupportNeeds" TEXT,
    "readingLevel" TEXT,
    "weakAreasText" TEXT,
    "voiceProfile" TEXT,
    "aiLearningProfileJson" TEXT,
    "guardianPermissions" TEXT,
    "schoolInformation" TEXT,
    "subjectFocus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentProfile_userId_key" ON "public"."ParentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_childId_key" ON "public"."StudentProfile"("childId");

-- AddForeignKey
ALTER TABLE "public"."ParentProfile" ADD CONSTRAINT "ParentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentProfile" ADD CONSTRAINT "StudentProfile_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
