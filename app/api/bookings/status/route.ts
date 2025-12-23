// app/api/bookings/status/route.ts
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

const ALLOWED = new Set(['BOOKED', 'ARRIVED', 'COMPLETED', 'CANCELED', 'NO_SHOW'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const bookingId = Number(body?.bookingId)
  const statusRaw = String(body?.status || '').trim().toUpperCase()

  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return NextResponse.json(
      { success: false, message: 'bookingId 无效' },
      { status: 400 },
    )
  }

  if (!ALLOWED.has(statusRaw)) {
    return NextResponse.json(
      { success: false, message: `status 无效：${statusRaw}` },
      { status: 400 },
    )
  }

  try {
    const now = new Date()
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: statusRaw as any,
        // ✅ 关键：只要变 COMPLETED 就写时间；否则清空，避免统计污染
        completedAt: statusRaw === 'COMPLETED' ? now : null,
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
      },
    })

    return NextResponse.json({ success: true, booking }, { status: 200 })
  } catch (e: any) {
    const msg =
      e?.code === 'P2025' ? 'booking 不存在' : e?.message || '更新失败'
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
