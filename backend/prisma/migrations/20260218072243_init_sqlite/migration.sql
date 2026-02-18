-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PoolAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BlacklistRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "siteName" TEXT NOT NULL,
    "supportContact" TEXT NOT NULL,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT NOT NULL,
    "enableNewUser" BOOLEAN NOT NULL DEFAULT true,
    "enablePlatinum" BOOLEAN NOT NULL DEFAULT true,
    "enableCorporate" BOOLEAN NOT NULL DEFAULT true,
    "disabledCorporateNames" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "ProxyNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastChecked" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProxyNode_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SystemConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LlmModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.2,
    "maxTokens" INTEGER NOT NULL DEFAULT 1024,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LlmModel_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SystemConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "BlacklistRecord_chainId_hotelName_idx" ON "BlacklistRecord"("chainId", "hotelName");
