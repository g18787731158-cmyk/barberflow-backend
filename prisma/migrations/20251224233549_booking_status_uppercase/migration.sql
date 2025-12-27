-- ✅ FIX: ensure `completedAt` exists (for shadow db apply)
SET @bf_has_completedAt := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'booking'
    AND COLUMN_NAME = 'completedAt'
);

SET @bf_sql := IF(
  @bf_has_completedAt = 0,
  'ALTER TABLE `booking` ADD COLUMN `completedAt` DATETIME(3) NULL;',
  'SELECT 1;'
);

PREPARE stmt FROM @bf_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- patch: ensure completedAt exists when replaying migrations on shadow db
ALTER TABLE `booking` ADD COLUMN `completedAt` DATETIME(3) NULL;

-- 1) 把默认值改成全大写
ALTER TABLE `booking`
  MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED';

-- 2) 统一历史值到全大写
UPDATE `booking`
SET `status` = UPPER(TRIM(`status`))
WHERE `status` IS NOT NULL;

-- 3) 兼容历史别名映射到标准值
UPDATE `booking` SET `status` = 'SCHEDULED' WHERE `status` IN ('PENDING','BOOKED');
UPDATE `booking` SET `status` = 'CANCELLED' WHERE `status` IN ('CANCELED','CANCEL');

-- 4) 非 COMPLETED 的单，completedAt 必须为空（保险）
UPDATE `booking`
SET `completedAt` = NULL
WHERE `status` IN ('SCHEDULED','CONFIRMED','CANCELLED');
