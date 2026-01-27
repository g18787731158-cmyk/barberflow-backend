// app/api/barbers/stats/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import {
  bizDateString,
  startOfBizDayUtc,
  endOfBizDayUtc,
  startOfBizWeekUtc,
  endOfBizWeekUtc,
  startOfBizMonthUtc,
  endOfBizMonthUtc,
} from '@/lib/tz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function amountOf(b: { price: any; payAmount: any }) {
  return Number(b.payAmount ?? b.price ?? 0)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barberId = Number(searchParams.get('barberId') || 0)
  if (!barberId) {
    return NextResponse.json({ error: 'barberId is required' }, { status: 400 })
  }

  const d = bizDateString()
  const startToday = startOfBizDayUtc(d)
  const endToday = endOfBizDayUtc(d)

  const startWeek = startOfBizWeekUtc(d)
  const endWeek = endOfBizWeekUtc(d)

  const startMonth = startOfBizMonthUtc(d)
  const endMonth = endOfBizMonthUtc(d)

  // 今日完成
  const todayCompleted = await prisma.booking.findMany({
    where: {
      barberId,
      status: STATUS.COMPLETED,
      startTime: { gte: startToday, lt: endToday },
    },
    select: { price: true, payAmount: true },
  })

  // 本周完成
  const weekCompleted = await prisma.booking.findMany({
    where: {
      barberId,
      status: STATUS.COMPLETED,
      startTime: { gte: startWeek, lt: endWeek },
    },
    select: { price: true, payAmount: true },
  })

  // 本月完成
  const monthCompleted = await prisma.booking.findMany({
    where: {
      barberId,
      status: STATUS.COMPLETED,
      startTime: { gte: startMonth, lt: endMonth },
    },
    select: { price: true, payAmount: true },
  })

  // 累计完成（不限制日期）
  const totalCompleted = await prisma.booking.findMany({
    where: { barberId, status: STATUS.COMPLETED },
    select: { price: true, payAmount: true },
  })

  // 最近预约（最多10条，不限状态）
  const recent = await prisma.booking.findMany({
    where: { barberId },
    include: { service: true, shop: true },
    orderBy: { startTime: 'desc' },
    take: 10,
  })

  const sum = (arr: { price: any; payAmount: any }[]) =>
    arr.reduce((acc, x) => acc + amountOf(x), 0)

  return NextResponse.json(
    {
      barberId,
      date: d,

      todayCount: todayCompleted.length,
      todayAmount: Math.round(sum(todayCompleted)),

      weekCount: weekCompleted.length,
      weekAmount: Math.round(sum(weekCompleted)),

      monthCount: monthCompleted.length,
      monthAmount: Math.round(sum(monthCompleted)),

      totalCount: totalCompleted.length,
      totalAmount: Math.round(sum(totalCompleted)),

      recentBookings: recent.map((b) => ({
        id: b.id,
        startTime: b.startTime,
        status: b.status,
        userName: b.userName,
        phone: b.phone,
        serviceName: b.service?.name ?? '',
        shopName: b.shop?.name ?? '',
        amount: Number(b.payAmount ?? b.price ?? 0),
      })),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
