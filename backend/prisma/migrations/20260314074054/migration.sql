/*
  Warnings:

  - A unique constraint covering the columns `[platform,platformHotelId,platformRoomTypeId,platformChannel,rateplanCode,date]` on the table `OtaCalendarItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[platform,platformHotelId,platformRoomTypeId,platformChannel,rateCode]` on the table `OtaRoomMapping` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `rateplanCode` to the `OtaCalendarItem` table without a default value. This is not possible if the table is not empty.
  - Made the column `rateCode` on table `OtaRoomMapping` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "OtaCalendarItem_platform_platformHotelId_platformRoomTypeId_key";

-- DropIndex
DROP INDEX "OtaRoomMapping_platform_platformHotelId_platformRoomTypeId_key";

-- AlterTable
ALTER TABLE "OtaCalendarItem" ADD COLUMN     "platformChannel" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "rateplanCode" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OtaRoomMapping" ALTER COLUMN "rateCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OtaCalendarItem_platform_platformHotelId_platformRoomTypeId_key" ON "OtaCalendarItem"("platform", "platformHotelId", "platformRoomTypeId", "platformChannel", "rateplanCode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OtaRoomMapping_platform_platformHotelId_platformRoomTypeId__key" ON "OtaRoomMapping"("platform", "platformHotelId", "platformRoomTypeId", "platformChannel", "rateCode");
