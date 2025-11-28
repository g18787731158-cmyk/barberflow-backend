CREATE TABLE `Booking` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `shopId` INT NOT NULL,
  `barberId` INT NOT NULL,
  `serviceId` INT NOT NULL,
  `startTime` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Booking_shopId_idx` (`shopId`),
  INDEX `Booking_barberId_idx` (`barberId`),
  INDEX `Booking_serviceId_idx` (`serviceId`),
  CONSTRAINT `Booking_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Booking_barberId_fkey` FOREIGN KEY (`barberId`) REFERENCES `Barber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Booking_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
