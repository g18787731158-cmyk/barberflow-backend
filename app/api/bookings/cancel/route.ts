import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type JsonObj = Record<string, unknown>

function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: Request): Promise<JsonObj> {
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
 *   这样不会触发 @@unique([barberId, startTime, slotLock]) 的冲突（MySQL 允许多个 NULL）
 * - 幂等：重复取消直接返回 ok
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const id = parsePosInt(body.id)

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid id' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id },
        select: { id: true, status: true, slotLock: true },
      })

      if (!b) return { kind: 'notfound' as const }

      // ✅ 幂等：已取消就直接返回，同时确保 slotLock 已经释放（NULL）
      if (b.status === 'CANCELED') {
        if (b.slotLock !== null) {
          await tx.booking.update({
            where: { id },
            data: { slotLock: null },
          })
        }
        return { kind: 'ok' as const, id, status: 'CANCELED' }
      }

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELED',
          slotLock: null, // ✅ 关键：释放锁用 NULL
          completedAt: null,
        },
        select: { id: true, status: true },
      })

      return { kind: 'ok' as const, id: updated.id, status: updated.status }
    })

    if (result.kind === 'notfound') {
      return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, id: result.id, status: result.status, slotLock: false })
  } catch (err: any) {
    console.error('[bookings/cancel] error:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
