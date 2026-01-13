
ALTER TABLE `barber` ADD COLUMN `openid` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Barber_openid_key` ON `barber`(`openid`);

