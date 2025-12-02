// app/api/barbers/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/barbers/stats?barberId=1&date=2025-12-01
// date 可选，不传则默认今天（按 +08:00 算）
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

    // 1️⃣ 计算日期范围
    let dateStr: string
    if (dateParam) {
      // 前端传来的 YYYY-MM-DD
      dateStr = dateParam
    } else {
      // 默认今天（东八区）
      const now = new Date()
      const y = now.getFullYear()
      const m = (now.getMonth() + 1).toString().padStart(2, '0')
      const d = now.getDate().toString().padStart(2, '0')
      dateStr = `${y}-${m}-${d}`
    }

    const start = new Date(`${dateStr}T00:00:00+08:00`)
    const end = new Date(`${dateStr}T23:59:59+08:00`)

    // 2️⃣ 拉取当日这个理发师的所有预约
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

    // 3️⃣ 业绩统计（后面可以再细化规则）
    // 规则先简单定为：排除已取消，其他都算进“完成单数”和金额
    const validForStats = bookings.filter((b) => b.status !== 'cancelled')

    const totalCount = validForStats.length
    const totalAmount = validForStats.reduce((sum, b) => {
      const p = typeof b.price === 'number' ? b.price : 0
      return sum + p
    }, 0)

    // 4️⃣ 返回给前端
    return NextResponse.json(
      {
        success: true,
        date: dateStr,
        barberId,
        stats: {
          totalCount,   // 今日有效单数
          totalAmount,  // 今日总金额（单位跟 price 一样，暂时按元）
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
