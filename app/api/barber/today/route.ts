// app/api/barber/today/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bizDateString, startOfBizDayUtc, endOfBizDayUtc, parseClientTimeToUtcDate } from '@/lib/tz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barberId = Number(searchParams.get('barberId') || 0)
  const date = searchParams.get('date') || undefined

  if (!barberId) {
    return NextResponse.json({ error: 'barberId is required' }, { status: 400 })
  }

  const isValidDate = date ? Boolean(parseClientTimeToUtcDate(date)) : false
  const d = isValidDate ? date! : bizDateString()
  const start = startOfBizDayUtc(d)
  const end = endOfBizDayUtc(d)

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
