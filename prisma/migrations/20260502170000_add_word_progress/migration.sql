CREATE TABLE "WordProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "pattern" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'seen',
    "mistakeType" TEXT,
    "lastSeen" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WordProgress_studentId_word_key" ON "WordProgress"("studentId", "word");