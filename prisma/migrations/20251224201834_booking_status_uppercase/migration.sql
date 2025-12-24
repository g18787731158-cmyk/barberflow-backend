
-- 1) 统一历史数据为全大写

UPDATE `booking` SET `status` = UPPER(`status`);


-- 2) 修改默认值为 SCHEDULED（保持列类型为 VARCHAR(191)）

ALTER TABLE `booking`

  MODIFY COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED';

