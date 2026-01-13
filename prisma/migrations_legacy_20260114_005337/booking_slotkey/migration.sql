ALTER TABLE `booking` ADD COLUMN `slotKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Booking_slotKey_key` ON `booking`(`slotKey`);

-- ✅ FIX: drop old unique index only if it exists (for shadow db replay)
SET @bf_has_old_slotlock_unique := (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND INDEX_NAME = 'Booking_barberId_startTime_slotLock_key'
);

SET @bf_sql := IF(
  @bf_has_old_slotlock_unique > 0,
  'DROP INDEX `Booking_barberId_startTime_slotLock_key` ON `booking`;',
  'SELECT 1;'
);

PREPARE stmt FROM @bf_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE INDEX `Booking_barberId_startTime_idx` ON `booking`(`barberId`, `startTime`);
