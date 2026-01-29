import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'
import {
  startOfBizDayUtc,
  endOfBizDayUtc,
  startOfBizWeekUtc,
  endOfBizWeekUtc,
  startOfBizMonthUtc,
  endOfBizMonthUtc,
  parseClientTimeToUtcDate,
} from '@/lib/tz'

export const runtime = 'nodejs'

type Range = 'day' | 'week' | 'month'

function rangeStartEndBiz(dateStr: string, range: Range) {
  if (range === 'day') {
    return { start: startOfBizDayUtc(dateStr), end: endOfBizDayUtc(dateStr) }
  }
  if (range === 'week') {
    return { start: startOfBizWeekUtc(dateStr), end: endOfBizWeekUtc(dateStr) }
  }
  return { start: startOfBizMonthUtc(dateStr), end: endOfBizMonthUtc(dateStr) }
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')
    const barberIdStr = searchParams.get('barberId')
    const rangeParam = (searchParams.get('range') as Range | null) ?? 'day'

    const range: Range = rangeParam === 'week' || rangeParam === 'month' ? rangeParam : 'day'

    if (!dateStr) {
      return NextResponse.json({ error: '缺少 date（YYYY-MM-DD）' }, { status: 400 })
    }

    if (!parseClientTimeToUtcDate(dateStr)) {
      return NextResponse.json({ error: 'date 格式不正确（YYYY-MM-DD）' }, { status: 400 })
    }
    const r = rangeStartEndBiz(dateStr, range)

    const where: any = {
      startTime: { gte: r.start, lt: r.end },
    }

    if (barberIdStr) {
      const barberId = Number(barberIdStr)
      if (!Number.isNaN(barberId) && barberId > 0) where.barberId = barberId
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        userName: true,
        phone: true,
        startTime: true,
        status: true,
        price: true,
        source: true,
        splitStatus: true, // ✅ 给前端判断“已结算”
        shop: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
    })

    return NextResponse.json({ bookings })
  } catch (err: any) {
    console.error('[admin/bookings] error:', err)
    return NextResponse.json(
      { error: '服务器错误，获取预约失败', detail: err?.message },
      { status: 500 },
    )
  }
}
