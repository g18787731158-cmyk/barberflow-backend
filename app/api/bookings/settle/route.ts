import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const bookingId = Number(body.bookingId)

  if (!bookingId) {
    return NextResponse.json({ success: false, message: 'bookingId required' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, completedAt: true },
  })

  if (!booking) {
    return NextResponse.json({ success: false, message: 'booking not found' }, { status: 404 })
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'COMPLETED',
      // ✅ 关键：业绩看板通常看 completedAt
      completedAt: booking.completedAt ?? new Date(),
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, booking: updated })
}
