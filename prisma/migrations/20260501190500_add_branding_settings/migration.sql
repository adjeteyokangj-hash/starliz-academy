CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteName" TEXT NOT NULL DEFAULT 'StarLiz Academy',
    "tagline" TEXT NOT NULL DEFAULT 'Learn • Grow • Shine',
    "logoUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "iconUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "faviconUrl" TEXT NOT NULL DEFAULT '/brand/starliz-logo.png',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
