import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
 * - 完成 = status: COMPLETED
 * - 释放时段 = slotLock: NULL（不是 false）
 * - 幂等：重复完成直接返回 ok，并确保 slotLock 已释放、completedAt 有值
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const id = parsePosInt(body.id ?? body.bookingId)

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid id' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const b = await tx.booking.findUnique({
        where: { id },
        select: { id: true, status: true, slotLock: true, completedAt: true },
      })

      if (!b) return { kind: 'notfound' as const }

      const isCompleted = String(b.status || '').toUpperCase() === 'COMPLETED'

      // ✅ 幂等：已完成也要保证 slotLock=null + completedAt 有值
      if (isCompleted) {
        let completedAt = b.completedAt
        const patch: any = {}

        if (b.slotLock !== null) patch.slotLock = null
        if (!completedAt) {
          completedAt = new Date()
          patch.completedAt = completedAt
        }

        if (Object.keys(patch).length) {
          await tx.booking.update({ where: { id }, data: patch, select: { id: true } })
        }

        return {
          kind: 'ok' as const,
          id,
          status: 'COMPLETED',
          slotLock: false,
          completedAt: completedAt ? completedAt.toISOString() : null,
          alreadyCompleted: true,
        }
      }

      const now = new Date()
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          slotLock: null,
        },
        select: { id: true, status: true, completedAt: true },
      })

      return {
        kind: 'ok' as const,
        id: updated.id,
        status: updated.status,
        slotLock: false,
        completedAt: updated.completedAt?.toISOString() ?? null,
        alreadyCompleted: false,
      }
    })

    if (result.kind === 'notfound') {
      return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[bookings/complete] error:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
