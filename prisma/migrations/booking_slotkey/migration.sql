
ALTER TABLE `booking` ADD COLUMN `slotKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Booking_slotKey_key` ON `booking`(`slotKey`);

DROP INDEX `Booking_barberId_startTime_slotLock_key` ON `booking`;

CREATE INDEX `Booking_barberId_startTime_idx` ON `booking`(`barberId`, `startTime`);

