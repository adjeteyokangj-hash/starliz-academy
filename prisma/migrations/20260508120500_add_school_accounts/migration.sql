-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pilot',
    "type" TEXT NOT NULL DEFAULT 'school',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressJson" TEXT,
    "notes" TEXT,
    "ownerUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "School_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "academicYear" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "teacherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Classroom_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "SchoolTeacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolTeacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'teacher',
    "status" TEXT NOT NULL DEFAULT 'invited',
    "title" TEXT,
    "invitedByUserId" TEXT,
    "invitedAt" DATETIME,
    "acceptedAt" DATETIME,
    "lastActiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolStudent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "classroomId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "externalRef" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolStudent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolStudent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolStudent_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchoolLicence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "pricingPlanId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pilot',
    "seatLimit" INTEGER NOT NULL DEFAULT 0,
    "seatPricePence" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "billingInterval" TEXT NOT NULL DEFAULT 'custom',
    "trialEndsAt" DATETIME,
    "currentPeriodEnd" DATETIME,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolLicence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE INDEX "School_status_idx" ON "School"("status");
CREATE INDEX "School_ownerUserId_idx" ON "School"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_schoolId_name_academicYear_key" ON "Classroom"("schoolId", "name", "academicYear");
CREATE INDEX "Classroom_schoolId_status_idx" ON "Classroom"("schoolId", "status");
CREATE INDEX "Classroom_teacherId_idx" ON "Classroom"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTeacher_schoolId_userId_key" ON "SchoolTeacher"("schoolId", "userId");
CREATE INDEX "SchoolTeacher_schoolId_role_idx" ON "SchoolTeacher"("schoolId", "role");
CREATE INDEX "SchoolTeacher_userId_idx" ON "SchoolTeacher"("userId");
CREATE INDEX "SchoolTeacher_status_idx" ON "SchoolTeacher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_schoolId_childId_key" ON "SchoolStudent"("schoolId", "childId");
CREATE UNIQUE INDEX "SchoolStudent_schoolId_externalRef_key" ON "SchoolStudent"("schoolId", "externalRef");
CREATE INDEX "SchoolStudent_schoolId_status_idx" ON "SchoolStudent"("schoolId", "status");
CREATE INDEX "SchoolStudent_classroomId_idx" ON "SchoolStudent"("classroomId");
CREATE INDEX "SchoolStudent_childId_idx" ON "SchoolStudent"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLicence_schoolId_key" ON "SchoolLicence"("schoolId");
CREATE INDEX "SchoolLicence_status_idx" ON "SchoolLicence"("status");
CREATE INDEX "SchoolLicence_pricingPlanId_idx" ON "SchoolLicence"("pricingPlanId");
CREATE INDEX "SchoolLicence_providerCustomerId_idx" ON "SchoolLicence"("providerCustomerId");
CREATE INDEX "SchoolLicence_providerSubscriptionId_idx" ON "SchoolLicence"("providerSubscriptionId");
