// app/api/barber/today/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cnDateString(date = new Date()) {
  // 返回 Asia/Shanghai 的 YYYY-MM-DD
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    // fallback：强行 +08:00
    const ms = date.getTime() + 8 * 60 * 60 * 1000
    return new Date(ms).toISOString().slice(0, 10)
  }
}

function getDayRangeCN(dateStr?: string) {
  const d =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : cnDateString()

  // 用 +08:00 计算当天范围，避免服务器时区导致“跨天”
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

  return NextResponse.json(
    {
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
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
