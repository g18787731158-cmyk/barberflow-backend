import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function normalize(status: string) {
  return String(status || '').trim().toUpperCase()
}

function derive(status: string) {
  // ✅ 规则核心：锁只跟“会占用未来时段”的状态走
  // 你后面加 CONFIRMED / CHECKED_IN 都很方便往这里塞
  const lockStatuses = new Set(['SCHEDULED', 'CONFIRMED'])
  const unlockStatuses = new Set(['CANCELED', 'COMPLETED', 'NO_SHOW'])

  if (unlockStatuses.has(status)) {
    return { slotLock: false }
  }
  if (lockStatuses.has(status)) {
    return { slotLock: true }
  }
  // 默认不改锁（更稳），但如果你希望未知状态一律不锁，也可以改成 false
  return { slotLock: undefined as unknown as boolean }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = Number(body?.id)
    const status = normalize(body?.status)

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
    }
    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, slotLock: true, completedAt: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const slotRule = derive(status)

    const data: any = { status }

    // slotLock：只有我们能推断时才写入
    if (slotRule.slotLock !== undefined) {
      data.slotLock = slotRule.slotLock
    }

    // completedAt 规则：完成才补；非完成可以清空（你想保留历史就把这段改掉）
    if (status === 'COMPLETED') {
      data.completedAt = booking.completedAt ?? new Date()
      data.slotLock = false
    } else if (status === 'CANCELED') {
      data.completedAt = null
      data.slotLock = false
    }

    const updated = await prisma.booking.update({
      where: { id },
      data,
      select: { id: true, status: true, slotLock: true, completedAt: true, updatedAt: true },
    })

    return NextResponse.json({ ok: true, booking: updated })
  } catch (err: any) {
    console.error('[admin/bookings/update-status] error:', err)
    return NextResponse.json(
      { error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
