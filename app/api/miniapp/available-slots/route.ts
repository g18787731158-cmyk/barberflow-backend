import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const WORK_START_HOUR = 10
const WORK_END_HOUR = 21
const SLOT_MINUTES = 30

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toCN_HHMM(d: Date) {
  const ms = d.getTime() + 8 * 60 * 60 * 1000
  const x = new Date(ms)
  return `${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}`
}

function buildCNRange(dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const slotsStart = new Date(`${dateStr}T${pad2(WORK_START_HOUR)}:00:00+08:00`)
  const slotsEnd = new Date(`${dateStr}T${pad2(WORK_END_HOUR)}:00:00+08:00`)

  return { dayStart, dayEnd, slotsStart, slotsEnd }
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

    const { dayStart, dayEnd, slotsStart, slotsEnd } = buildCNRange(dateStr)

    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: { gte: dayStart, lt: dayEnd },
        // ✅ 先按“未取消”算占用，避免 slotLock 让你全放开
        status: { notIn: ['CANCELLED', 'CANCELED'] as any },
        // 如果你确认创建预约时 slotLock 一定为 true，再把下面这行加回去：
        // slotLock: true,
      },
      include: { service: { select: { durationMinutes: true } } },
      orderBy: { startTime: 'asc' },
    })

    const blockedRanges = bookings.map((b) => {
      const duration = b.service?.durationMinutes ?? SLOT_MINUTES
      return { start: b.startTime, end: addMinutes(b.startTime, duration) }
    })

    const responseSlots: { time: string; label: string; disabled: boolean }[] = []

    let cursor = slotsStart
    while (cursor < slotsEnd) {
      const slotStart = new Date(cursor.getTime())
      const label = toCN_HHMM(slotStart)

      const isBlocked = blockedRanges.some((r) => slotStart >= r.start && slotStart < r.end)

      responseSlots.push({
        time: label,
        label,
        disabled: isBlocked,
      })

      cursor = addMinutes(cursor, SLOT_MINUTES)
    }

    return NextResponse.json(responseSlots)
  } catch (err) {
    console.error('[miniapp/available-slots] error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
