// app/api/barber/today/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function getCNDateStr() {
  // 生成中国时区 YYYY-MM-DD，避免凌晨跨天拿到昨天（UTC坑）
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function getDayRangeCN(dateStr?: string) {
  const d = dateStr || getCNDateStr()
  const start = new Date(`${d}T00:00:00.000+08:00`)
  const end = new Date(`${d}T23:59:59.999+08:00`)
  return { d, start, end }
}

// 输出也顺手做个统一（避免库里历史数据有 pending/scheduled）
function normalizeStatusOut(s: any) {
  const raw = String(s || '')
  const up = raw.toUpperCase()
  if (raw === 'pending' || raw === 'scheduled' || up === 'PENDING' || up === 'SCHEDULED') return 'BOOKED'
  if (raw === 'cancelled' || up === 'CANCELLED') return 'CANCELED'
  if (up === 'DONE') return 'COMPLETED'
  return up || 'BOOKED'
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberId = Number(searchParams.get('barberId') || 0)
    const date = searchParams.get('date') || undefined // YYYY-MM-DD 可选

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

    const res = NextResponse.json({
      barberId,
      date: d,
      bookings: bookings.map((b) => ({
        id: b.id,
        startTime: b.startTime,
        status: normalizeStatusOut(b.status),
        userName: b.userName,
        phone: b.phone,
        serviceName: b.service?.name ?? '',
        shopName: b.shop?.name ?? '',
        price: Number(b.price ?? b.payAmount ?? 0),
        payStatus: b.payStatus,
      })),
    })

    // 强制不缓存（避免你看到“昨天”还在）
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
    return res
  } catch (e: any) {
    console.error('GET /api/barber/today error', e)
    return NextResponse.json({ error: 'internal error', detail: String(e) }, { status: 500 })
  }
}
