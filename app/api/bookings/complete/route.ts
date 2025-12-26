import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = Number(body?.id)

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, slotLock: true, completedAt: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // ✅ 幂等：已完成则补齐 completedAt/slotLock 后返回 ok
    if (booking.status === 'COMPLETED') {
      const needFix = booking.slotLock || !booking.completedAt
      if (needFix) {
        const fixed = await prisma.booking.update({
          where: { id },
          data: {
            slotLock: false,
            completedAt: booking.completedAt ?? new Date(),
          },
          select: { id: true, status: true, slotLock: true, completedAt: true },
        })
        return NextResponse.json({ ok: true, ...fixed, alreadyCompleted: true })
      }
      return NextResponse.json({
        ok: true,
        id,
        status: 'COMPLETED',
        slotLock: false,
        completedAt: booking.completedAt,
        alreadyCompleted: true,
      })
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        slotLock: false,
        completedAt: booking.completedAt ?? new Date(),
      },
      select: { id: true, status: true, slotLock: true, completedAt: true },
    })

    return NextResponse.json({ ok: true, ...updated })
  } catch (err: any) {
    console.error('[bookings/complete] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
