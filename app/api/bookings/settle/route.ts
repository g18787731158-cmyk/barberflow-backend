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
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: 'bookingId is required' },
        { status: 400 },
      )
    }

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

      // 如果你们业务上“取消的订单不能完成”，这里直接挡住（不想挡就删掉这段）
      if (currentStatus === 'CANCELED' || currentStatus === 'CANCELLED') {
        return {
          ok: false as const,
          status: 400 as const,
          error: 'Canceled booking cannot be settled',
          booking,
        }
      }

      // ✅ 幂等：已完成也要补 completedAt
      if (currentStatus === 'COMPLETED') {
        if (booking.completedAt) {
          return { ok: true as const, patched: false as const, booking }
        }

        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: { completedAt: now },
          select: { id: true, status: true, completedAt: true, updatedAt: true },
        })

        return { ok: true as const, patched: true as const, booking: updated }
      }

      // 未完成 -> 置为完成 + 写 completedAt
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { ok: true as const, patched: true as const, booking: updated }
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, booking: (result as any).booking },
        { status: result.status },
      )
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[settle] error:', err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal Server Error' },
      { status: 500 },
    )
  }
}
