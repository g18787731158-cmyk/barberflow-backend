import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function parseDayRange(dateStr?: string) {
  // 按中国时区 +08:00 切日，避免服务器时区不同导致“今天”错位
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const start = new Date(`${d}T00:00:00.000+08:00`)
  const end = new Date(`${d}T23:59:59.999+08:00`)
  return { d, start, end }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barberId = Number(searchParams.get('barberId') || 1)
  const date = searchParams.get('date') || undefined

  if (!barberId) {
    return NextResponse.json({ error: 'barberId is required' }, { status: 400 })
  }

  const { d, start, end } = parseDayRange(date)

  const bookings = await prisma.booking.findMany({
    where: {
      barberId,
      startTime: { gte: start, lte: end },
    },
    include: {
      service: true,
      shop: true,
    },
    orderBy: { startTime: 'asc' },
  })

  const rows = bookings.map((b: any) => ({
    id: b.id,
    startTime: b.startTime,
    status: b.status,
    userName: b.userName,
    phone: b.phone,
    serviceName: b.service?.name ?? '',
    shopName: b.shop?.name ?? '',
    // 你 schema 里有 price / payAmount，这里先用 price，没有就回退 service.price
    price: Number(b.price ?? b.service?.price ?? 0),
  }))

  const revenue = rows.reduce((sum, x) => sum + (Number(x.price) || 0), 0)

  return NextResponse.json({
    barberId,
    date: d,
    kpi: { count: rows.length, revenue },
    bookings: rows,
  })
}
