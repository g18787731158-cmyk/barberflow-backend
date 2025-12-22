import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST /api/bookings/settle
// 最小可用：把订单状态置为 COMPLETED
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const bookingId = Number(body.bookingId ?? body.id)

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return NextResponse.json({ success: false, message: 'bookingId 必须是数字' }, { status: 400 })
    }

    const existing = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    })

    if (!existing) {
      return NextResponse.json({ success: false, message: `未找到 id=${bookingId} 的预约` }, { status: 404 })
    }

    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED' },
      select: { id: true, status: true },
    })

    const res = NextResponse.json({ success: true, booking }, { status: 200 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error: any) {
    console.error('POST /api/bookings/settle error', error)
    return NextResponse.json(
      { success: false, message: '结算失败', error: String(error) },
      { status: 500 }
    )
  }
}
