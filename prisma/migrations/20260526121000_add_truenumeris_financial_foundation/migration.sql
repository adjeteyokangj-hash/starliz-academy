-- CreateTable
CREATE TABLE "public"."TrueNumerisIntegration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "region" TEXT NOT NULL DEFAULT 'UK',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEncrypted" TEXT,
    "baseUrl" TEXT,
    "autoInvoice" BOOLEAN NOT NULL DEFAULT true,
    "autoVat" BOOLEAN NOT NULL DEFAULT true,
    "autoReconciliation" BOOLEAN NOT NULL DEFAULT true,
    "syncFrequencyMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrueNumerisIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialSyncEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "eventType" TEXT NOT NULL,
    "studentId" TEXT,
    "parentId" TEXT,
    "invoiceNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "paymentProvider" TEXT,
    "paymentReference" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "parentId" TEXT,
    "studentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "providerReference" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialSyncEvent_syncStatus_createdAt_idx" ON "public"."FinancialSyncEvent"("syncStatus", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialSyncEvent_paymentProvider_paymentReference_idx" ON "public"."FinancialSyncEvent"("paymentProvider", "paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSyncEvent_paymentProvider_paymentReference_eventType_key" ON "public"."FinancialSyncEvent"("paymentProvider", "paymentReference", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInvoice_invoiceNumber_key" ON "public"."FinancialInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInvoice_providerReference_key" ON "public"."FinancialInvoice"("providerReference");

-- CreateIndex
CREATE INDEX "FinancialInvoice_status_createdAt_idx" ON "public"."FinancialInvoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialInvoice_parentId_idx" ON "public"."FinancialInvoice"("parentId");

-- CreateIndex
CREATE INDEX "FinancialInvoice_studentId_idx" ON "public"."FinancialInvoice"("studentId");
