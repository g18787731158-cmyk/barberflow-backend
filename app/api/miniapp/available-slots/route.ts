import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const WORK_START_HOUR = 10
const WORK_END_HOUR = 21
const SLOT_MINUTES = 30

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function buildDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)

  const start = new Date(y, m - 1, d, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0)

  const slotsStart = new Date(y, m - 1, d, WORK_START_HOUR, 0, 0)
  const slotsEnd = new Date(y, m - 1, d, WORK_END_HOUR, 0, 0)

  return { start, end, slotsStart, slotsEnd }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdParam = searchParams.get('barberId')
    const dateStr = searchParams.get('date')

    if (!barberIdParam || !dateStr) {
      return NextResponse.json({ error: 'Missing barberId or date' }, { status: 400 })
    }

    const barberId = Number(barberIdParam)
    if (Number.isNaN(barberId) || barberId <= 0) {
      return NextResponse.json({ error: 'Invalid barberId' }, { status: 400 })
    }

    const { start: dayStart, end: dayEnd, slotsStart, slotsEnd } = buildDayRange(dateStr)

    // ✅ 只查“仍在占用时段”的预约（slotLock=true）
    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: { gte: dayStart, lt: dayEnd },
        slotLock: true,
      },
      include: {
        service: { select: { durationMinutes: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    const blockedRanges = bookings.map((b) => {
      const duration = b.service?.durationMinutes ?? SLOT_MINUTES
      const end = addMinutes(b.startTime, duration)
      return { start: b.startTime, end }
    })

    type Slot = { label: string; startTime: string; available: boolean }
    const rawSlots: Slot[] = []

    let cursor = slotsStart
    while (cursor < slotsEnd) {
      const slotStart = new Date(cursor.getTime())
      const hour = String(slotStart.getHours()).padStart(2, '0')
      const minute = String(slotStart.getMinutes()).padStart(2, '0')
      const label = `${hour}:${minute}`

      const isBlocked = blockedRanges.some((r) => slotStart >= r.start && slotStart < r.end)

      rawSlots.push({
        label,
        startTime: slotStart.toISOString(),
        available: !isBlocked,
      })

      cursor = addMinutes(cursor, SLOT_MINUTES)
    }

    const responseSlots = rawSlots.map((s) => ({
      time: s.label,
      label: s.label,
      disabled: !s.available,
    }))

    return NextResponse.json(responseSlots)
  } catch (err) {
    console.error('[miniapp/available-slots] error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
