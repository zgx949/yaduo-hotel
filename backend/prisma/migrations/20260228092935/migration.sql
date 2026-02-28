-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "PoolAccount" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "loginTokenCipher" TEXT,
    "remark" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isPlatinum" BOOLEAN NOT NULL DEFAULT false,
    "isNewUser" BOOLEAN NOT NULL DEFAULT false,
    "corporateAgreements" JSONB NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "breakfastCoupons" INTEGER NOT NULL DEFAULT 0,
    "roomUpgradeCoupons" INTEGER NOT NULL DEFAULT 0,
    "lateCheckoutCoupons" INTEGER NOT NULL DEFAULT 0,
    "slippersCoupons" INTEGER NOT NULL DEFAULT 0,
    "dailyOrdersLeft" INTEGER NOT NULL DEFAULT 0,
    "lastExecution" JSONB NOT NULL,
    "lastResult" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGroup" (
    "id" TEXT NOT NULL,
    "bizOrderNo" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "totalNights" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "atourOrderId" TEXT,
    "bookingTier" TEXT,
    "roomTypeId" TEXT,
    "rateCode" TEXT,
    "rateCodeId" TEXT,
    "rpActivityId" TEXT,
    "rateCodePriceType" TEXT,
    "rateCodeActivities" TEXT,
    "roomType" TEXT NOT NULL,
    "roomCount" INTEGER NOT NULL DEFAULT 1,
    "accountId" TEXT,
    "accountPhone" TEXT,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "executionStatus" TEXT NOT NULL,
    "splitIndex" INTEGER NOT NULL DEFAULT 1,
    "splitTotal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistRecord" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "reporterId" TEXT,
    "source" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlacklistRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL,
    "supportContact" TEXT NOT NULL,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT NOT NULL,
    "enableNewUser" BOOLEAN NOT NULL DEFAULT true,
    "enablePlatinum" BOOLEAN NOT NULL DEFAULT true,
    "enableCorporate" BOOLEAN NOT NULL DEFAULT true,
    "disabledCorporateNames" JSONB NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskModuleConfig" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 3,
    "backoffMs" INTEGER NOT NULL DEFAULT 3000,
    "useProxy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attemptsMade" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "orderGroupId" TEXT,
    "orderItemId" TEXT,
    "proxyId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyNode" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "authEnabled" BOOLEAN NOT NULL DEFAULT false,
    "authUsername" TEXT NOT NULL DEFAULT '',
    "authPassword" TEXT NOT NULL DEFAULT '',
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProxyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmModel" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LlmModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

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

-- CreateIndex
CREATE INDEX "BlacklistRecord_chainId_hotelName_idx" ON "BlacklistRecord"("chainId", "hotelName");

-- CreateIndex
CREATE UNIQUE INDEX "TaskModuleConfig_moduleId_key" ON "TaskModuleConfig"("moduleId");

-- CreateIndex
CREATE INDEX "TaskRun_moduleId_createdAt_idx" ON "TaskRun"("moduleId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskRun_queueName_state_idx" ON "TaskRun"("queueName", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_queueName_jobId_key" ON "TaskRun"("queueName", "jobId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PoolAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "OrderGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProxyNode" ADD CONSTRAINT "ProxyNode_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SystemConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmModel" ADD CONSTRAINT "LlmModel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SystemConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
