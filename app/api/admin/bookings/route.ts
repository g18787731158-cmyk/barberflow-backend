import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type Range = 'day' | 'week' | 'month'

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function getRangeStartEnd(base: Date, range: Range) {
  // 统一把 base 归零到当天 0 点
  const dayBase = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  )

  if (range === 'week') {
    // 以周一为一周开始
    const weekStart = new Date(dayBase)
    const day = weekStart.getDay() // 0: 周日, 1: 周一...
    const diffToMonday = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diffToMonday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    return { start: weekStart, end: weekEnd }
  }

  if (range === 'month') {
    const monthStart = new Date(
      dayBase.getFullYear(),
      dayBase.getMonth(),
      1,
      0,
      0,
      0,
      0,
    )
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    )
    return { start: monthStart, end: monthEnd }
  }

  // 默认 day：当天 0 点 ~ 次日 0 点
  const start = dayBase
  const end = new Date(
    dayBase.getFullYear(),
    dayBase.getMonth(),
    dayBase.getDate() + 1,
    0,
    0,
    0,
    0,
  )
  return { start, end }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const barberIdStr = searchParams.get('barberId')
  const rangeParam = searchParams.get('range') as Range | null

  const range: Range = rangeParam === 'week' || rangeParam === 'month'
    ? rangeParam
    : 'day'

  if (!dateStr) {
    return NextResponse.json(
      { error: '缺少日期参数 date（格式 YYYY-MM-DD）' },
      { status: 400 },
    )
  }

  const base = parseDate(dateStr)
  if (!base) {
    return NextResponse.json(
      { error: '日期格式不正确，需为 YYYY-MM-DD' },
      { status: 400 },
    )
  }

  const { start, end } = getRangeStartEnd(base, range)

  const where: any = {
    startTime: {
      gte: start,
      lt: end,
    },
  }

  if (barberIdStr) {
    const barberId = Number(barberIdStr)
    if (!Number.isNaN(barberId)) {
      where.barberId = barberId
    }
  }

  try {
    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return NextResponse.json({ bookings })
  } catch (err) {
    console.error('获取后台预约失败:', err)
    return NextResponse.json(
      { error: '服务器错误，获取预约失败' },
      { status: 500 },
    )
  }
}
