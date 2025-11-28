import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') // 例如 "2025-11-20"
    const barberIdParam = searchParams.get('barberId') // 例如 "1"
    const barberId = barberIdParam ? Number(barberIdParam) : null

    if (!date || !barberId) {
      return NextResponse.json(
        { error: '缺少参数 date 或 barberId' },
        { status: 400 },
      )
    }

    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59`)

    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        service: {
          select: { durationMinutes: true },
        },
      },
    })

    const occupied = new Set<string>() // 形如 "13:00" / "13:30"

    for (const b of bookings) {
      const duration = b.service?.durationMinutes ?? 30
      const blocks = Math.max(1, Math.ceil(duration / 30))
      const start = new Date(b.startTime)

      for (let i = 0; i < blocks; i++) {
        const d = new Date(start)
        d.setMinutes(d.getMinutes() + i * 30)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        occupied.add(`${hh}:${mm}`)
      }
    }

    return NextResponse.json({ occupiedSlots: Array.from(occupied) })
  } catch (err: any) {
    console.error('获取可用时间出错', err)
    return NextResponse.json(
      { error: '服务器错误', detail: err?.message },
      { status: 500 },
    )
  }
}
