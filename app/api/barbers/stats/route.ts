// app/api/barbers/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 没传 date 就用今天（本地时区）
function normalizeDateStr(dateStr: string | null): string {
  if (!dateStr) {
    const now = new Date()
    const y = now.getFullYear()
    const m = (now.getMonth() + 1).toString().padStart(2, '0')
    const d = now.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return dateStr
}

// 计算 日 / 周 / 月 时间范围
function getRanges(dateStr: string) {
  const base = new Date(`${dateStr}T00:00:00+08:00`)

  // 当天
  const dayStart = new Date(base)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(base)
  dayEnd.setHours(23, 59, 59, 999)

  // 本周（周一为一周开始）
  const wd = base.getDay() // 0-6, 周日是 0
  const deltaToMonday = (wd + 6) % 7
  const weekStart = new Date(base)
  weekStart.setDate(base.getDate() - deltaToMonday)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  // 本月
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0)
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999)

  return { dayStart, dayEnd, weekStart, weekEnd, monthStart, monthEnd }
}

// 只统计 completed 的单，金额优先用 booking.price，其次 payAmount
function calcStats(bookings: any[]) {
  let count = 0
  let amount = 0

  for (const b of bookings) {
    if (b.status !== 'completed') continue // ✳️ 严格：只认 completed

    count += 1

    const price =
      typeof b.price === 'number'
        ? b.price
        : typeof b.payAmount === 'number'
        ? b.payAmount
        : 0

    amount += price
  }

  return { count, amount }
}

// GET /api/barbers/stats?barberId=1&date=2025-12-03
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdStr = searchParams.get('barberId')

    if (!barberIdStr) {
      return NextResponse.json(
        { success: false, message: '缺少 barberId' },
        { status: 400 }
      )
    }

    const barberId = Number(barberIdStr)
    if (!Number.isFinite(barberId)) {
      return NextResponse.json(
        { success: false, message: 'barberId 格式不正确' },
        { status: 400 }
      )
    }

    const dateStr = normalizeDateStr(searchParams.get('date'))
    const { dayStart, dayEnd, weekStart, weekEnd, monthStart, monthEnd } =
      getRanges(dateStr)

    const [
      todayBookings,
      weekBookings,
      monthBookings,
      allBookings,
      recentBookings,
    ] = await Promise.all([
      // 今日全部预约（后面 calcStats 再按 status 过滤）
      prisma.booking.findMany({
        where: {
          barberId,
          startTime: { gte: dayStart, lte: dayEnd },
        },
      }),
      // 本周
      prisma.booking.findMany({
        where: {
          barberId,
          startTime: { gte: weekStart, lte: weekEnd },
        },
      }),
      // 本月
      prisma.booking.findMany({
        where: {
          barberId,
          startTime: { gte: monthStart, lte: monthEnd },
        },
      }),
      // 累计
      prisma.booking.findMany({
        where: { barberId },
      }),
      // 最近 10 条（用来列表展示）
      prisma.booking.findMany({
        where: { barberId },
        include: {
          shop: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { startTime: 'desc' },
        take: 10,
      }),
    ])

    const stats = {
      today: calcStats(todayBookings),
      week: calcStats(weekBookings),
      month: calcStats(monthBookings),
      total: calcStats(allBookings),
    }

    return NextResponse.json(
      {
        success: true,
        date: dateStr,
        barberId,
        stats,
        bookings: recentBookings,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/barbers/stats error', error)
    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
        error: String(error),
      },
      { status: 500 }
    )
  }
}
