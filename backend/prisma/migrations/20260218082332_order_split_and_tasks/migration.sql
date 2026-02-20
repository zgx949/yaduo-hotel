-- CreateTable
CREATE TABLE "OrderGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bizOrderNo" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "checkInDate" DATETIME NOT NULL,
    "checkOutDate" DATETIME NOT NULL,
    "totalNights" INTEGER NOT NULL,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderGroup_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "atourOrderId" TEXT,
    "roomType" TEXT NOT NULL,
    "roomCount" INTEGER NOT NULL DEFAULT 1,
    "accountId" TEXT,
    "accountPhone" TEXT,
    "checkInDate" DATETIME NOT NULL,
    "checkOutDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "executionStatus" TEXT NOT NULL,
    "splitIndex" INTEGER NOT NULL DEFAULT 1,
    "splitTotal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrderGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PoolAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderGroup_bizOrderNo_key" ON "OrderGroup"("bizOrderNo");

-- CreateIndex
CREATE INDEX "OrderGroup_creatorId_createdAt_idx" ON "OrderGroup"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderGroup_status_paymentStatus_idx" ON "OrderGroup"("status", "paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_atourOrderId_key" ON "OrderItem"("atourOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_groupId_splitIndex_idx" ON "OrderItem"("groupId", "splitIndex");

-- CreateIndex
CREATE INDEX "OrderItem_accountId_idx" ON "OrderItem"("accountId");

-- CreateIndex
CREATE INDEX "OrderItem_status_paymentStatus_idx" ON "OrderItem"("status", "paymentStatus");

-- CreateIndex
CREATE INDEX "Task_orderItemId_createdAt_idx" ON "Task"("orderItemId", "createdAt");
