import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

type JsonObj = Record<string, unknown>

function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: NextRequest): Promise<JsonObj> {
  try {
    const v = await req.json()
    return isJsonObj(v) ? v : {}
  } catch {
    return {}
  }
}

function parsePosInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

/**
 * 规则：
 * - 取消 = status: CANCELED
 * - 释放时段 = slotLock: NULL（不是 false）
 * - 幂等：重复取消直接返回 ok
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const id = parsePosInt(body.id ?? body.bookingId) // ✅ 关键：兼容 bookingId

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid id' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id },
        select: { id: true, status: true, slotLock: true },
      })

      if (!b) return { kind: 'notfound' as const }

      if (String(b.status).toUpperCase() === 'CANCELED' || String(b.status).toUpperCase() === 'CANCELLED') {
        if (b.slotLock !== null) {
          await tx.booking.update({
            where: { id },
            data: { slotLock: null },
            select: { id: true },
          })
        }
        return { kind: 'ok' as const, id, status: 'CANCELED', slotLock: false }
      }

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELED',
          slotLock: null,
          completedAt: null,
        },
        select: { id: true, status: true, slotLock: true },
      })

      return { kind: 'ok' as const, id: updated.id, status: updated.status, slotLock: false }
    })

    if (result.kind === 'notfound') {
      return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, id: result.id, status: result.status, slotLock: result.slotLock })
  } catch (err: any) {
    console.error('[bookings/cancel] error:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
