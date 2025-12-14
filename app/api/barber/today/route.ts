import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function getDayRangeCN(dateStr?: string) {
  // 用 +08:00 计算当天范围，避免服务器时区导致“跨天”
  const d = dateStr || new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const start = new Date(`${d}T00:00:00.000+08:00`)
  const end = new Date(`${d}T23:59:59.999+08:00`)
  return { d, start, end }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barberId = Number(searchParams.get('barberId') || 0)
  const date = searchParams.get('date') || undefined

  if (!barberId) {
    return NextResponse.json({ error: 'barberId is required' }, { status: 400 })
  }

  const { d, start, end } = getDayRangeCN(date)

  const bookings = await prisma.booking.findMany({
    where: {
      barberId,
      startTime: { gte: start, lte: end },
    },
    include: { service: true, shop: true },
    orderBy: { startTime: 'asc' },
  })

  return NextResponse.json({
    barberId,
    date: d,
    bookings: bookings.map((b) => ({
      id: b.id,
      startTime: b.startTime,
      status: b.status,
      userName: b.userName,
      phone: b.phone,
      serviceName: b.service?.name ?? '',
      shopName: b.shop?.name ?? '',
      price: Number(b.price ?? b.payAmount ?? 0),
      payStatus: b.payStatus,
    })),
  })
}
