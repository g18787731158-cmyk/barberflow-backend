// lib/time.ts

/** 把 yyyy-MM-dd 这样的日期字符串，转换成北京当天的开始和结束时间 */
export function getDayRangeInBeijing(dateStr: string) {
  // dateStr 形如 "2025-11-25"
  const [year, month, day] = dateStr.split('-').map(Number)

  // 北京时间 = UTC+8，这里我们直接用本地时区来构造
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0)

  return { start, end }
}
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
