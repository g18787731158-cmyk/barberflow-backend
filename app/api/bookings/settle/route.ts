import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { booking as BookingModel } from '@prisma/client'

export const runtime = 'nodejs'

type BookingStatus = BookingModel['status']
type JsonObj = Record<string, unknown>

function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: Request): Promise<JsonObj | null> {
  try {
    const v = await req.json()
    return isJsonObj(v) ? v : null
  } catch {
    return null
  }
}

function parseId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

function upperStatus(s: unknown): string {
  return typeof s === 'string' ? s.trim().toUpperCase() : ''
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.bookingId ?? body.id)
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: 'bookingId is required' }, { status: 400 })
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      if (!booking) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' }
      }

      const cur = upperStatus(booking.status)

      if (cur === 'CANCELED' || cur === 'CANCELLED') {
        return { ok: false as const, status: 400 as const, error: 'Canceled booking cannot be settled' }
      }

      // ✅ 幂等：已完成但 completedAt 为空 -> 补写
      if (cur === 'COMPLETED') {
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

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED' as unknown as BookingStatus,
          completedAt: now,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { ok: true as const, patched: true as const, booking: updated }
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[settle] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
