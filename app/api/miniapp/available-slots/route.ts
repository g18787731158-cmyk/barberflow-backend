// app/api/miniapp/available-slots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const WORK_START_HOUR = 10   // 10:00 开始
const WORK_END_HOUR = 21     // 21:00 收工
const SLOT_MINUTES = 30      // 每格 30 分钟

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function buildDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)

  // 一天的开始/结束（用于查当天所有预约）
  const start = new Date(y, m - 1, d, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0)

  // 时间格的开始/结束（例如 10:00 ~ 21:00）
  const slotsStart = new Date(y, m - 1, d, WORK_START_HOUR, 0, 0)
  const slotsEnd = new Date(y, m - 1, d, WORK_END_HOUR, 0, 0) // 不含 21:00

  return { start, end, slotsStart, slotsEnd }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdParam = searchParams.get('barberId')
    const dateStr = searchParams.get('date')

    if (!barberIdParam || !dateStr) {
      return NextResponse.json(
        { error: 'Missing barberId or date' },
        { status: 400 },
      )
    }

    const barberId = Number(barberIdParam)
    if (Number.isNaN(barberId)) {
      return NextResponse.json({ error: 'Invalid barberId' }, { status: 400 })
    }

    const { start: dayStart, end: dayEnd, slotsStart, slotsEnd } =
      buildDayRange(dateStr)

    // 查当天该理发师所有未取消的预约，顺带把 service 的 durationMinutes 带出来
    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: {
          gte: dayStart,
          lt: dayEnd,
        },
        status: {
          notIn: ['cancelled'],
        },
      },
      include: {
        service: {
          select: {
            durationMinutes: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    })

    // 把每个预约转换为一个「占用时间段」： [start, end)
    const blockedRanges = bookings.map((b) => {
      // 如果没取到服务时长，就按一格 30 分钟兜底
      const duration = b.service?.durationMinutes ?? SLOT_MINUTES
      const end = addMinutes(b.startTime, duration)
      return { start: b.startTime, end }
    })

    // 生成当天的每个 30 分钟时间格
    const slots: {
      label: string
      startTime: string
      available: boolean
    }[] = []

    let cursor = slotsStart
    while (cursor < slotsEnd) {
      const slotStart = new Date(cursor.getTime())
      const hour = String(slotStart.getHours()).padStart(2, '0')
      const minute = String(slotStart.getMinutes()).padStart(2, '0')
      const label = `${hour}:${minute}`

      // ⭐ 关键逻辑：只要这个时间点落在任何一个预约的 [start, end) 区间内，就视为已占用
      const isBlocked = blockedRanges.some(
        (r) => slotStart >= r.start && slotStart < r.end,
      )

      slots.push({
        label,
        startTime: slotStart.toISOString(),
        available: !isBlocked,
      })

      cursor = addMinutes(cursor, SLOT_MINUTES)
    }

    return NextResponse.json({
      barberId,
      date: dateStr,
      slots,
    })
  } catch (err) {
    console.error('[miniapp/available-slots] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}
