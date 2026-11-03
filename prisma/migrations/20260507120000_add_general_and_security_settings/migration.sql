CREATE TABLE "GeneralSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appName" TEXT NOT NULL DEFAULT 'StarLiz Academy',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SecuritySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumber" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecial" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeoutHours" INTEGER NOT NULL DEFAULT 24,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "twoFaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
