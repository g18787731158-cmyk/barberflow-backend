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

function parseStatus(v: unknown): { rawUpper: string; typed: BookingStatus } | null {
  if (typeof v !== 'string') return null
  const rawUpper = v.trim().toUpperCase()
  if (!rawUpper) return null
  return { rawUpper, typed: rawUpper as unknown as BookingStatus }
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.bookingId ?? body.id)
  const st = parseStatus(body.status)

  if (!bookingId) {
    return NextResponse.json({ ok: false, error: 'bookingId is required' }, { status: 400 })
  }
  if (!st) {
    return NextResponse.json({ ok: false, error: 'status is required' }, { status: 400 })
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

      const currentUpper = String(booking.status ?? '').toUpperCase()
      const targetUpper = st.rawUpper

      const nextCompletedAt = targetUpper === 'COMPLETED' ? (booking.completedAt ?? now) : null

      const alreadyOk =
        currentUpper === targetUpper &&
        ((targetUpper === 'COMPLETED' && booking.completedAt != null) ||
          (targetUpper !== 'COMPLETED' && booking.completedAt == null))

      if (alreadyOk) {
        return { ok: true as const, changed: false as const, booking }
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: st.typed,
          completedAt: nextCompletedAt,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { ok: true as const, changed: true as const, booking: updated }
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[status] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
