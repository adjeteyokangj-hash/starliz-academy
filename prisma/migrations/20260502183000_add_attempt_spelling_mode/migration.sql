CREATE TABLE IF NOT EXISTS "Attempt" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"studentId" TEXT NOT NULL,
	"subject" TEXT NOT NULL,
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
	"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "Attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "ChildProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Attempt_studentId_subject_skillFocus_idx" ON "Attempt"("studentId", "subject", "skillFocus");
CREATE INDEX IF NOT EXISTS "Attempt_createdAt_idx" ON "Attempt"("createdAt");

ALTER TABLE "Attempt" ADD COLUMN "spellingMode" TEXT;