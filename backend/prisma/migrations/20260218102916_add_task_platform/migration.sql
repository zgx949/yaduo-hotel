-- CreateTable
CREATE TABLE "TaskModuleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskModuleConfig_moduleId_key" ON "TaskModuleConfig"("moduleId");

-- CreateIndex
CREATE INDEX "TaskRun_moduleId_createdAt_idx" ON "TaskRun"("moduleId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskRun_queueName_state_idx" ON "TaskRun"("queueName", "state");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRun_queueName_jobId_key" ON "TaskRun"("queueName", "jobId");
