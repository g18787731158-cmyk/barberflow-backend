import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function pickId(body: any) {
  const raw = body?.id ?? body?.bookingId ?? body?.bookingID
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

function pickStatus(body: any) {
  const s = (body?.status ?? body?.newStatus ?? '').toString().trim()
  return s
}

async function handler(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = pickId(body)
    const status = pickStatus(body)

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Missing id or status' },
        { status: 400 },
      )
    }

    const data: any = { status }

    // ✅ 规则：只要变成 COMPLETED / CANCELLED 就解锁
    if (status === 'COMPLETED') {
      data.slotLock = false
      data.completedAt = new Date()
    } else if (status === 'CANCELLED') {
      data.slotLock = false
    }

    const booking = await prisma.booking.update({
      where: { id },
      data,
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return NextResponse.json({ ok: true, booking })
  } catch (err: any) {
    console.error('[admin/bookings/update-status] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  return handler(req)
}

export async function PATCH(req: NextRequest) {
  return handler(req)
}
