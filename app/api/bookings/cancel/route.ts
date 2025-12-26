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
      select: { id: true, status: true, slotLock: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // ✅ 幂等：已取消就直接返回 ok
    if (booking.status === 'CANCELED') {
      // 顺手兜底：确保 slotLock=false
      if (booking.slotLock) {
        await prisma.booking.update({
          where: { id },
          data: { slotLock: false },
        })
      }
      return NextResponse.json({ ok: true, id, status: 'CANCELED', slotLock: false })
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELED',
        slotLock: false,
        // 取消一般不留 completedAt；如果你希望保留历史完成时间可删掉这行
        completedAt: null,
      },
      select: { id: true, status: true, slotLock: true },
    })

    return NextResponse.json({ ok: true, ...updated })
  } catch (err: any) {
    console.error('[bookings/cancel] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
