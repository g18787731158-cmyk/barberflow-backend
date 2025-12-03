// app/api/miniapp/available-slots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'  // ⭐ 这里改成默认导入

const SLOT_MINUTES = 30 // 半小时一格

function generateSlotsForDate(
  dateStr: string,
  startHour: number,
  endHour: number
): Date[] {
  const [year, month, day] = dateStr.split('-').map(Number)
  const start = new Date(year, month - 1, day, startHour, 0, 0)
  const end = new Date(year, month - 1, day, endHour, 0, 0)

  const slots: Date[] = []
  const current = new Date(start)

  while (current < end) {
    slots.push(new Date(current))
    current.setMinutes(current.getMinutes() + SLOT_MINUTES)
  }

  return slots
}

function formatTimeLabel(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdParam = searchParams.get('barberId')
    const date = searchParams.get('date') // 'YYYY-MM-DD'

    if (!barberIdParam || !date) {
      return NextResponse.json(
        { error: 'Missing barberId or date' },
        { status: 400 }
      )
    }

    const barberId = Number(barberIdParam)
    if (Number.isNaN(barberId)) {
      return NextResponse.json(
        { error: 'Invalid barberId' },
        { status: 400 }
      )
    }

    // 先查出理发师的上下班时间
    const barber = await prisma.barber.findUnique({
      where: { id: barberId },
    })

    if (!barber) {
      return NextResponse.json(
        { error: 'Barber not found' },
        { status: 404 }
      )
    }

    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59`)

    // 查当日该理发师所有未取消预约（status != 'cancelled'）
    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
        NOT: {
          status: 'cancelled',
        },
      },
      select: {
        startTime: true,
      },
    })

    const slots = generateSlotsForDate(
      date,
      barber.workStartHour,
      barber.workEndHour
    ).map((slot) => {
      const conflict = bookings.some((b) => {
        const booked = new Date(b.startTime)
        return (
          booked.getHours() === slot.getHours() &&
          booked.getMinutes() === slot.getMinutes()
        )
      })

      return {
        label: formatTimeLabel(slot), // 'HH:mm'
        startTime: slot.toISOString(),
        available: !conflict,
      }
    })

    return NextResponse.json({
      barberId,
      date,
      slots,
    })
  } catch (error) {
    console.error('[available-slots] error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
