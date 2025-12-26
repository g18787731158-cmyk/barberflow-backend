import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function pickId(body: any) {
  const raw = body?.id ?? body?.bookingId ?? body?.bookingID
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = pickId(body)

    if (!id) {
      return NextResponse.json({ error: 'Missing booking id' }, { status: 400 })
    }

    const now = new Date()

    // 关键：完成 => 解锁 + 写 completedAt
    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        slotLock: false,
        completedAt: now,
      },
    })

    return NextResponse.json({ ok: true, booking })
  } catch (err: any) {
    console.error('[bookings/complete] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
