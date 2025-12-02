import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/barbers/stats?barberId=1&date=2025-12-01
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdStr = searchParams.get('barberId')
    const dateParam = searchParams.get('date')

    if (!barberIdStr) {
      return NextResponse.json(
        { success: false, message: '缺少 barberId' },
        { status: 400 }
      )
    }

    const barberId = Number(barberIdStr)
    if (Number.isNaN(barberId)) {
      return NextResponse.json(
        { success: false, message: 'barberId 不合法' },
        { status: 400 }
      )
    }

    // 日期计算
    let dateStr: string
    if (dateParam) {
      dateStr = dateParam
    } else {
      const now = new Date()
      const y = now.getFullYear()
      const m = (now.getMonth() + 1).toString().padStart(2, '0')
      const d = now.getDate().toString().padStart(2, '0')
      dateStr = `${y}-${m}-${d}`
    }

    const start = new Date(`${dateStr}T00:00:00+08:00`)
    const end = new Date(`${dateStr}T23:59:59+08:00`)

    const bookings = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        startTime: 'desc',
      },
      include: {
        shop: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
    })

    // 排除已取消
    const validForStats = bookings.filter((b) => b.status !== 'cancelled')

    const totalCount = validForStats.length
    const totalAmount = validForStats.reduce((sum, b) => {
      // 优先用 booking.price（真实成交价），没有的话退回 service.price
      const p =
        typeof b.price === 'number'
          ? b.price
          : typeof b.service?.price === 'number'
          ? b.service.price
          : 0
      return sum + p
    }, 0)

    return NextResponse.json(
      {
        success: true,
        date: dateStr,
        barberId,
        stats: {
          totalCount,
          totalAmount,
        },
        bookings,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/barbers/stats error', error)
    return NextResponse.json(
      {
        success: false,
        message: '理发师业绩统计接口出错',
        error: String(error),
      },
      { status: 500 }
    )
  }
}
