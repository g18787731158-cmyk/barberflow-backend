/*
  Warnings:

  - You are about to drop the column `scheduleId` on the `booking` table. All the data in the column will be lost.
  - You are about to drop the `schedule` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[barberId,startTime]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `barberId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shopId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `booking` DROP COLUMN `scheduleId`,
    ADD COLUMN `barberId` INTEGER NOT NULL,
    ADD COLUMN `shopId` INTEGER NOT NULL,
    ADD COLUMN `startTime` DATETIME(3) NOT NULL,
    MODIFY `phone` VARCHAR(191) NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled';

-- AlterTable
ALTER TABLE `service` ADD COLUMN `durationMinutes` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `price` INTEGER NOT NULL;

-- DropTable
DROP TABLE `schedule`;

-- CreateTable
CREATE TABLE `Shop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Barber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NULL,
    `workStartHour` INTEGER NOT NULL DEFAULT 10,
    `workEndHour` INTEGER NOT NULL DEFAULT 21,
    `shopId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Booking_barberId_startTime_key` ON `Booking`(`barberId`, `startTime`);

-- AddForeignKey
ALTER TABLE `Barber` ADD CONSTRAINT `Barber_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_barberId_fkey` FOREIGN KEY (`barberId`) REFERENCES `Barber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
