import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const prisma = new PrismaClient()

const ALLOWED = new Set(['BOOKED', 'ARRIVED', 'COMPLETED', 'CANCELED', 'NO_SHOW'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const bookingId = Number(body.bookingId)
  const status = String(body.status || '').trim().toUpperCase()

  if (!bookingId || !status) {
    return NextResponse.json({ success: false, message: 'bookingId/status required' }, { status: 400 })
  }
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ success: false, message: `invalid status: ${status}` }, { status: 400 })
  }

  // ✅ 统一 completedAt 逻辑：完成就写时间；取消/回退就清空
  const data: any = { status }
  if (status === 'COMPLETED') data.completedAt = new Date()
  if (status !== 'COMPLETED') data.completedAt = null

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data,
    select: { id: true, status: true, completedAt: true, updatedAt: true },
  })

  return NextResponse.json({ success: true, booking: updated })
}
