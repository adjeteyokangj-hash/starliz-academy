-- CreateTable
CREATE TABLE "AIAdaptationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frustrationThreshold" INTEGER NOT NULL DEFAULT 3,
    "lowConfidenceThreshold" INTEGER NOT NULL DEFAULT 40,
    "adaptationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "warmupRequired" BOOLEAN NOT NULL DEFAULT true,
    "shortSessionMins" INTEGER NOT NULL DEFAULT 5,
    "normalSessionMins" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
