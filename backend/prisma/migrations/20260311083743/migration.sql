-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "invoiceName" TEXT NOT NULL,
    "invoiceType" INTEGER NOT NULL DEFAULT 13,
    "invoiceTitleType" INTEGER NOT NULL DEFAULT 2,
    "taxNo" TEXT,
    "address" TEXT,
    "telephone" TEXT,
    "bank" TEXT,
    "account" TEXT,
    "email" TEXT,
    "remark" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceRecord" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "orderGroupId" TEXT NOT NULL,
    "invoiceTemplateId" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "orderId" TEXT,
    "chainId" TEXT NOT NULL,
    "invoiceType" INTEGER NOT NULL,
    "invoiceTitleType" INTEGER NOT NULL,
    "invoiceName" TEXT NOT NULL,
    "taxNo" TEXT,
    "email" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "stateDesc" TEXT,
    "submittedPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplate_invoiceId_key" ON "InvoiceTemplate"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_invoiceName_idx" ON "InvoiceTemplate"("invoiceName");

-- CreateIndex
CREATE INDEX "InvoiceTemplate_createdAt_idx" ON "InvoiceTemplate"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRecord_orderItemId_key" ON "InvoiceRecord"("orderItemId");

-- CreateIndex
CREATE INDEX "InvoiceRecord_orderGroupId_createdAt_idx" ON "InvoiceRecord"("orderGroupId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceRecord_invoiceTemplateId_idx" ON "InvoiceRecord"("invoiceTemplateId");

-- CreateIndex
CREATE INDEX "InvoiceRecord_state_idx" ON "InvoiceRecord"("state");

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_invoiceTemplateId_fkey" FOREIGN KEY ("invoiceTemplateId") REFERENCES "InvoiceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
