-- CreateTable
CREATE TABLE "OtaHotel" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL,
    "cityId" TEXT,
    "city" TEXT,
    "address" TEXT,
    "tel" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYNC',
    "rawPayload" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaHotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaRoomType" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "platformRoomTypeId" TEXT NOT NULL,
    "roomTypeName" TEXT NOT NULL,
    "bedType" TEXT,
    "gid" TEXT,
    "rpid" TEXT,
    "outRid" TEXT,
    "rateplanCode" TEXT,
    "vendor" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hotelId" TEXT NOT NULL,

    CONSTRAINT "OtaRoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaHotelMapping" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "shid" TEXT,
    "platformHotelName" TEXT NOT NULL,
    "internalChainId" TEXT NOT NULL,
    "internalHotelName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaHotelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaRoomMapping" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "platformRoomTypeId" TEXT NOT NULL,
    "srid" TEXT,
    "platformRoomTypeName" TEXT NOT NULL,
    "internalRoomTypeId" TEXT NOT NULL,
    "internalRoomTypeName" TEXT NOT NULL,
    "rateCode" TEXT NOT NULL,
    "rateCodeId" TEXT,
    "rpActivityId" TEXT,
    "breakfastCount" INTEGER NOT NULL DEFAULT 0,
    "guaranteeType" INTEGER NOT NULL DEFAULT 0,
    "cancelPolicyCal" JSONB,
    "publishStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "lastPublishedAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "bookingTier" TEXT NOT NULL,
    "platformChannel" TEXT NOT NULL,
    "orderSubmitMode" TEXT NOT NULL,
    "autoOrderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "manualTuningEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncFutureDays" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaRoomMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaChannelMapping" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformChannel" TEXT NOT NULL,
    "internalBookingTier" TEXT NOT NULL,
    "internalChannelName" TEXT NOT NULL,
    "autoSubmit" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaCalendarItem" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "platformRoomTypeId" TEXT NOT NULL,
    "platformChannel" TEXT NOT NULL DEFAULT 'DEFAULT',
    "rateplanCode" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "inventory" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastPushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaCalendarItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaInboundOrder" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "platformHotelId" TEXT NOT NULL,
    "platformRoomTypeId" TEXT NOT NULL,
    "platformChannel" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "checkInDate" TEXT NOT NULL,
    "checkOutDate" TEXT NOT NULL,
    "roomCount" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "remark" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaInboundOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaOrderBinding" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "localOrderId" TEXT,
    "templatePayload" JSONB,
    "autoSubmitState" TEXT NOT NULL,
    "manualPaymentState" TEXT NOT NULL,
    "bookingConfirmState" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaOrderBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaSyncLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtaHotel_platform_updatedAt_idx" ON "OtaHotel"("platform", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OtaHotel_platform_platformHotelId_key" ON "OtaHotel"("platform", "platformHotelId");

-- CreateIndex
CREATE INDEX "OtaRoomType_platform_platformHotelId_idx" ON "OtaRoomType"("platform", "platformHotelId");

-- CreateIndex
CREATE UNIQUE INDEX "OtaRoomType_platform_platformHotelId_platformRoomTypeId_key" ON "OtaRoomType"("platform", "platformHotelId", "platformRoomTypeId");

-- CreateIndex
CREATE INDEX "OtaHotelMapping_platform_enabled_idx" ON "OtaHotelMapping"("platform", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OtaHotelMapping_platform_platformHotelId_key" ON "OtaHotelMapping"("platform", "platformHotelId");

-- CreateIndex
CREATE INDEX "OtaRoomMapping_platform_enabled_idx" ON "OtaRoomMapping"("platform", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OtaRoomMapping_platform_platformHotelId_platformRoomTypeId__key" ON "OtaRoomMapping"("platform", "platformHotelId", "platformRoomTypeId", "platformChannel", "rateCode");

-- CreateIndex
CREATE INDEX "OtaChannelMapping_platform_enabled_idx" ON "OtaChannelMapping"("platform", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OtaChannelMapping_platform_platformChannel_key" ON "OtaChannelMapping"("platform", "platformChannel");

-- CreateIndex
CREATE INDEX "OtaCalendarItem_platform_date_idx" ON "OtaCalendarItem"("platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OtaCalendarItem_platform_platformHotelId_platformRoomTypeId_key" ON "OtaCalendarItem"("platform", "platformHotelId", "platformRoomTypeId", "platformChannel", "rateplanCode", "date");

-- CreateIndex
CREATE INDEX "OtaInboundOrder_platform_status_idx" ON "OtaInboundOrder"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OtaInboundOrder_platform_externalOrderId_key" ON "OtaInboundOrder"("platform", "externalOrderId");

-- CreateIndex
CREATE INDEX "OtaOrderBinding_platform_autoSubmitState_idx" ON "OtaOrderBinding"("platform", "autoSubmitState");

-- CreateIndex
CREATE UNIQUE INDEX "OtaOrderBinding_platform_externalOrderId_key" ON "OtaOrderBinding"("platform", "externalOrderId");

-- CreateIndex
CREATE INDEX "OtaSyncLog_platform_createdAt_idx" ON "OtaSyncLog"("platform", "createdAt");

-- AddForeignKey
ALTER TABLE "OtaRoomType" ADD CONSTRAINT "OtaRoomType_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "OtaHotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
