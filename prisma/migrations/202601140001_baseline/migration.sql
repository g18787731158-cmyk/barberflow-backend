[dotenv@17.2.3] injecting env (5) from .env -- tip: ⚙️  override existing env vars with { override: true }
-- CreateTable
CREATE TABLE `barber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `shopId` INTEGER NOT NULL,
    `workStartHour` INTEGER NOT NULL,
    `workEndHour` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Barber_shopId_fkey`(`shopId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barberservice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `barberId` INTEGER NOT NULL,
    `serviceId` INTEGER NOT NULL,
    `price` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BarberService_serviceId_idx`(`serviceId`),
    UNIQUE INDEX `BarberService_barberId_serviceId_key`(`barberId`, `serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `shopId` INTEGER NOT NULL,
    `barberId` INTEGER NOT NULL,
    `serviceId` INTEGER NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
    `slotLock` BOOLEAN NULL DEFAULT true,
    `completedAt` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `price` INTEGER NULL,
    `payStatus` VARCHAR(191) NOT NULL DEFAULT 'unpaid',
    `payAmount` INTEGER NOT NULL DEFAULT 0,
    `payOrderNo` VARCHAR(191) NULL,
    `payTime` DATETIME(3) NULL,
    `splitStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `splitDetail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Booking_barberId_idx`(`barberId`),
    INDEX `Booking_phone_idx`(`phone`),
    INDEX `Booking_serviceId_idx`(`serviceId`),
    INDEX `Booking_shopId_idx`(`shopId`),
    UNIQUE INDEX `Booking_barberId_startTime_slotLock_key`(`barberId`, `startTime`, `slotLock`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `billingBaseMode` VARCHAR(191) NOT NULL DEFAULT 'none',
    `billingBaseValue` INTEGER NOT NULL DEFAULT 0,
    `billingExtraMode` VARCHAR(191) NOT NULL DEFAULT 'none',
    `billingExtraValue` INTEGER NOT NULL DEFAULT 0,
    `platformShareBasis` INTEGER NOT NULL DEFAULT 0,
    `shopShareBasis` INTEGER NOT NULL DEFAULT 0,
    `barberShareBasis` INTEGER NOT NULL DEFAULT 0,
    `enableAutoSplit` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledger_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `detail` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Ledger_bookingId_idx`(`bookingId`),
    UNIQUE INDEX `Ledger_bookingId_type_key`(`bookingId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `barber_timeoff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `barberId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `startMinute` INTEGER NULL,
    `endMinute` INTEGER NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BarberTimeOff_barberId_idx`(`barberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `barber` ADD CONSTRAINT `Barber_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barberservice` ADD CONSTRAINT `BarberService_barberId_fkey` FOREIGN KEY (`barberId`) REFERENCES `barber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barberservice` ADD CONSTRAINT `BarberService_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `Booking_barberId_fkey` FOREIGN KEY (`barberId`) REFERENCES `barber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `Booking_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `Booking_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `Ledger_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `barber_timeoff` ADD CONSTRAINT `BarberTimeOff_barberId_fkey` FOREIGN KEY (`barberId`) REFERENCES `barber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

