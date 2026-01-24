import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'

export const runtime = 'nodejs'

type Range = 'day' | 'week' | 'month'

const CN_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function cnMidnightMs(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  const ms = d.getTime()
  return Number.isNaN(ms) ? null : ms
}

function cnGetYMDFromMs(ms: number) {
  const x = new Date(ms + CN_OFFSET_MS)
  return {
    y: x.getUTCFullYear(),
    m: x.getUTCMonth() + 1,
    d: x.getUTCDate(),
  }
}

function cnDayOfWeekFromMs(ms: number) {
  const x = new Date(ms + CN_OFFSET_MS)
  return x.getUTCDay() // 0(日)~6(六)
}

function rangeStartEndCN(dateStr: string, range: Range) {
  const baseMs = cnMidnightMs(dateStr)
  if (baseMs === null) return null

  if (range === 'day') {
    return { start: new Date(baseMs), end: new Date(baseMs + DAY_MS) }
  }

  if (range === 'week') {
    const dow = cnDayOfWeekFromMs(baseMs) // 0=周日
    const diffToMon = dow === 0 ? -6 : 1 - dow
    const weekStartMs = baseMs + diffToMon * DAY_MS
    const weekEndMs = weekStartMs + 7 * DAY_MS
    return { start: new Date(weekStartMs), end: new Date(weekEndMs) }
  }

  const { y, m } = cnGetYMDFromMs(baseMs)
  const monthStart = new Date(`${y}-${pad2(m)}-01T00:00:00+08:00`).getTime()
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const monthEnd = new Date(`${nextY}-${pad2(nextM)}-01T00:00:00+08:00`).getTime()
  return { start: new Date(monthStart), end: new Date(monthEnd) }
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

    const r = rangeStartEndCN(dateStr, range)
    if (!r) {
      return NextResponse.json({ error: 'date 格式不正确（YYYY-MM-DD）' }, { status: 400 })
    }

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
