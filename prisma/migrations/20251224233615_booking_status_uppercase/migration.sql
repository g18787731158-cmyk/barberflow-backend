
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

