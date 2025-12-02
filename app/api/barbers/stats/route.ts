// app/api/barbers/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 工具：把 Date 转成 YYYY-MM-DD
function formatDate(d: Date) {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDayRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const start = d
  const end = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start, end }
}

function getWeekRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const day = d.getDay() || 7 // 周一 = 1, 周日 = 7
  const monday = new Date(d.getTime() - (day - 1) * 24 * 60 * 60 * 1000)
  const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  return { start: monday, end: sunday }
}

function getMonthRange(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

// 统一用 “status = completed” 来统计，先不管付没付钱
const COMPLETED_STATUS = 'completed'

// GET /api/barbers/stats?barberId=1&date=2025-12-03
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdStr = searchParams.get('barberId') || '1'
    const dateStr = searchParams.get('date') || formatDate(new Date())

    const barberId = Number(barberIdStr)
    if (!barberId || Number.isNaN(barberId)) {
      return NextResponse.json(
        { success: false, message: 'barberId 不合法' },
        { status: 400 }
      )
    }

    const { start: todayStart, end: todayEnd } = getDayRange(dateStr)
    const { start: weekStart, end: weekEnd } = getWeekRange(dateStr)
    const { start: monthStart, end: monthEnd } = getMonthRange(dateStr)

    // 今天已完成
    const todayBookings = await prisma.booking.findMany({
      where: {
        barberId,
        status: COMPLETED_STATUS,
        startTime: { gte: todayStart, lte: todayEnd },
      },
      include: {
        shop: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    // 本周、本月、累计只要数量，可以只拉 id + price
    const weekBookings = await prisma.booking.findMany({
      where: {
        barberId,
        status: COMPLETED_STATUS,
        startTime: { gte: weekStart, lte: weekEnd },
      },
      include: {
        service: { select: { price: true } },
      },
    })

    const monthBookings = await prisma.booking.findMany({
      where: {
        barberId,
        status: COMPLETED_STATUS,
        startTime: { gte: monthStart, lte: monthEnd },
      },
      include: {
        service: { select: { price: true } },
      },
    })

    const totalBookings = await prisma.booking.findMany({
      where: {
        barberId,
        status: COMPLETED_STATUS,
      },
      include: {
        service: { select: { price: true } },
      },
    })

    // 金额优先用 booking.price，其次 service.price
    const sumAmount = (list: any[]) =>
      list.reduce((sum, b) => {
        const price =
          (typeof b.price === 'number' ? b.price : null) ??
          (b.service && typeof b.service.price === 'number'
            ? b.service.price
            : 0)
        return sum + price
      }, 0)

    const stats = {
      todayCount: todayBookings.length,
      todayAmount: sumAmount(todayBookings),
      weekCount: weekBookings.length,
      weekAmount: sumAmount(weekBookings),
      monthCount: monthBookings.length,
      monthAmount: sumAmount(monthBookings),
      totalCount: totalBookings.length,
      totalAmount: sumAmount(totalBookings),
    }

    return NextResponse.json(
      {
        success: true,
        date: dateStr,
        barberId,
        stats,
        bookings: todayBookings,
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
