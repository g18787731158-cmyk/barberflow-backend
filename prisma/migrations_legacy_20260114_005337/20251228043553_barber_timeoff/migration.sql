
-- CreateTable

CREATE TABLE `barber_timeoff` (

  `id` INT NOT NULL AUTO_INCREMENT,

  `barberId` INT NOT NULL,

  `type` VARCHAR(191) NOT NULL,

  `startAt` DATETIME(3) NULL,

  `endAt` DATETIME(3) NULL,

  `startMinute` INT NULL,

  `endMinute` INT NULL,

  `enabled` TINYINT(1) NOT NULL DEFAULT 1,

  `note` VARCHAR(191) NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),

  INDEX `BarberTimeOff_barberId_idx` (`barberId`),

  CONSTRAINT `BarberTimeOff_barberId_fkey`

    FOREIGN KEY (`barberId`) REFERENCES `barber`(`id`)

    ON DELETE RESTRICT ON UPDATE CASCADE

) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

