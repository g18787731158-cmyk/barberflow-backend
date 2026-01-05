import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
const CN_OFFSET_MS = 8 * 60 * 60 * 1000

function cnDayRange(dateStr: string) {
  // ✅ 强制按中国时区切天（+08:00）
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// ✅ 把 Date 转成中国本地 HH:mm（不依赖服务器时区）
function toCN_HHMM(d: Date) {
  const x = new Date(d.getTime() + CN_OFFSET_MS)
  return `${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const barberIdParam = searchParams.get('barberId')
    const barberId = barberIdParam ? Number(barberIdParam) : null

    if (!date || !barberId || Number.isNaN(barberId)) {
      return NextResponse.json({ error: '缺少参数 date 或 barberId' }, { status: 400 })
    }

    const { start: dayStart, end: dayEnd } = cnDayRange(date)

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
        occupied.add(toCN_HHMM(t))
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
