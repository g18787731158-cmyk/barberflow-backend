import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

export const runtime = 'nodejs'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

const prisma = globalThis.__prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma

function toInt(v: unknown) {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))

    const bookingId = toInt(body.bookingId ?? body.id)
    const statusRaw = body.status

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: 'bookingId is required' },
        { status: 400 },
      )
    }
    if (typeof statusRaw !== 'string' || !statusRaw.trim()) {
      return NextResponse.json(
        { ok: false, error: 'status is required' },
        { status: 400 },
      )
    }

    const targetStatus = statusRaw.trim().toUpperCase()
    const now = new Date()

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })
      if (!booking) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' }
      }

      const currentStatus = String(booking.status ?? '').toUpperCase()

      // 计算 completedAt 写入策略
      const nextCompletedAt =
        targetStatus === 'COMPLETED' ? (booking.completedAt ?? now) : null

      // 如果状态没变且 completedAt 也符合预期，就直接返回（避免无意义写库）
      const completedAtMatches =
        (targetStatus === 'COMPLETED' && booking.completedAt != null) ||
        (targetStatus !== 'COMPLETED' && booking.completedAt == null)

      if (currentStatus === targetStatus && completedAtMatches) {
        return { ok: true as const, changed: false as const, booking }
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: targetStatus,
          completedAt: nextCompletedAt,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { ok: true as const, changed: true as const, booking: updated }
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status },
      )
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[status] error:', err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal Server Error' },
      { status: 500 },
    )
  }
}
