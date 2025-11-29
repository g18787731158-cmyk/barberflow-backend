// lib/prisma.ts

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

// 这里导出一个“命名导出” prisma
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 你也可以关掉日志：不想看就注释掉
    log: ['error', 'warn'],
  })

// 开发环境下把 prisma 挂到全局，避免热更新重复 new
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// 如果你项目里有地方用默认导出，也顺手兼容一下
export default prisma
