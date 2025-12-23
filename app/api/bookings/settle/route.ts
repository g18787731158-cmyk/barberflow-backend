// app/api/bookings/settle/route.ts
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const bookingId = Number(body?.bookingId)

  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return NextResponse.json(
      { success: false, message: 'bookingId 无效' },
      { status: 400 },
    )
  }

  try {
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(), // ✅ 关键：业绩看板通常看这个
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
      },
    })

    return NextResponse.json({ success: true, booking }, { status: 200 })
  } catch (e: any) {
    // Prisma: 记录不存在通常会抛 P2025
    const msg =
      e?.code === 'P2025' ? 'booking 不存在' : e?.message || '结算失败'
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
