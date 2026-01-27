import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  startOfBizDayUtc,
  endOfBizDayUtc,
  parseClientTimeToUtcDate,
  utcDateToBizHHmm,
} from '@/lib/tz'

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const barberIdParam = searchParams.get('barberId')
    const barberId = barberIdParam ? Number(barberIdParam) : null

    if (!date || !barberId || Number.isNaN(barberId)) {
      return NextResponse.json({ error: '缺少参数 date 或 barberId' }, { status: 400 })
    }

    if (!parseClientTimeToUtcDate(date)) {
      return NextResponse.json({ error: 'date 格式不正确（YYYY-MM-DD）' }, { status: 400 })
    }

    const dayStart = startOfBizDayUtc(date)
    const dayEnd = endOfBizDayUtc(date)

    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: { gte: dayStart, lt: dayEnd }, // ✅ lt 次日0点
        slotLock: true, // ✅ 取消后 slotLock=null，自然就不占位了
        status: { notIn: ['CANCELLED', 'CANCELED', 'CANCELED', 'CANCELED', 'CANCELED'] as any },
      },
      include: {
        service: { select: { durationMinutes: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    const occupied = new Set<string>()

    for (const b of bookings) {
      const duration = b.service?.durationMinutes ?? SLOT_MINUTES
      const blocks = Math.max(1, Math.ceil(duration / SLOT_MINUTES))

      for (let i = 0; i < blocks; i++) {
        const t = new Date(b.startTime.getTime() + i * SLOT_MINUTES * 60 * 1000)
        occupied.add(utcDateToBizHHmm(t))
      }
    }

    return NextResponse.json({ occupiedSlots: Array.from(occupied) })
  } catch (err: any) {
    console.error('[availability] error:', err)
    return NextResponse.json(
      { error: '服务器错误', detail: err?.message },
      { status: 500 },
    )
  }
}
