import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = Number(body?.bookingId)

    if (!bookingId) {
      return NextResponse.json({ ok: false, error: 'bookingId 必填' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, payStatus: true },
    })
    if (!booking) {
      return NextResponse.json({ ok: false, error: 'booking 不存在' }, { status: 404 })
    }

    // 幂等：重复回调也 OK
    if (booking.payStatus === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true, bookingId })
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        payStatus: 'paid',
        payTime: new Date(),
      },
    })

    return NextResponse.json({ ok: true, bookingId, payStatus: 'paid' })
  } catch (e: any) {
    console.error('[miniapp/pay/mock-success] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
