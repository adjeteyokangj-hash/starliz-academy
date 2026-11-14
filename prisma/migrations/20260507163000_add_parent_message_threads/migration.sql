-- Create conversation thread table for parent messaging channels (WhatsApp/SMS)
CREATE TABLE "ParentMessageThread" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "contactAddress" TEXT NOT NULL,
  "contactLabel" TEXT,
  "parentId" TEXT,
  "parentEmail" TEXT,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastInboundAt" DATETIME,
  "lastOutboundAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ParentMessageThread_channel_contactAddress_key"
ON "ParentMessageThread"("channel", "contactAddress");

CREATE INDEX "ParentMessageThread_lastMessageAt_idx"
ON "ParentMessageThread"("lastMessageAt");

-- Create per-message table to persist full conversation history
CREATE TABLE "ParentMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "providerSid" TEXT,
  "providerStatus" TEXT,
  "mediaUrlsJson" TEXT,
  "actorUserId" TEXT,
  "sentAt" DATETIME,
  "receivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ParentMessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ParentMessage_providerSid_key"
ON "ParentMessage"("providerSid");

CREATE INDEX "ParentMessage_threadId_createdAt_idx"
ON "ParentMessage"("threadId", "createdAt");

CREATE INDEX "ParentMessage_direction_createdAt_idx"
ON "ParentMessage"("direction", "createdAt");
