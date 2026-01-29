import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { STATUS, canonStatus } from '@/lib/status'

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

function clampBps(n: any) {
  const x = Number(n ?? 0)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(10000, Math.trunc(x)))
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const id = parsePosInt(body.id ?? body.bookingId)

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid id' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          completedAt: true,
          price: true,
          splitStatus: true,
          shop: {
            select: {
              platformShareBasis: true,
              barberShareBasis: true,
              shopShareBasis: true,
            },
          },
          service: { select: { price: true } },
        },
      })

      if (!booking) return { kind: 'notfound' as const }

      const st = canonStatus(booking.status)
      if (st !== STATUS.COMPLETED) {
        return { kind: 'not_completed' as const }
      }

      // ✅ 保证 completedAt 有值（否则后面账目对不上）
      let patchedCompletedAt = false
      const now = new Date()
      const completedAt = booking.completedAt ?? now

      if (!booking.completedAt) {
        await tx.booking.update({
          where: { id },
          data: { completedAt },
          select: { id: true },
        })
        patchedCompletedAt = true
      }

      const amountTotal = Number(booking.price ?? booking.service?.price ?? 0)
      if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
        return { kind: 'bad_amount' as const }
      }

      const platformFeeBps = clampBps(booking.shop?.platformShareBasis)
      const barberFeeBps = clampBps(booking.shop?.barberShareBasis)

      const platformFeeAmount = Math.floor((amountTotal * platformFeeBps) / 10000)
      const barberFeeAmount = Math.floor((amountTotal * barberFeeBps) / 10000)
      const shopAmount = amountTotal - platformFeeAmount - barberFeeAmount

      const breakdown = {
        amountTotal,
        platformFeeBps,
        platformFeeAmount,
        barberFeeBps,
        barberFeeAmount,
        shopAmount,
        basis: 'bps/10000',
        computedAt: new Date().toISOString(),
      }

      // ✅ 幂等：同一 bookingId 的 SETTLE 只允许一条
      const ledger = await tx.ledger.upsert({
        where: { bookingId_type: { bookingId: id, type: 'SETTLE' } },
        create: {
          bookingId: id,
          type: 'SETTLE',
          amount: amountTotal,
          status: 'CREATED',
          detail: JSON.stringify(breakdown),
        },
        update: {
          amount: amountTotal,
          status: 'CREATED',
          detail: JSON.stringify(breakdown),
        },
      })

      // ✅ 写回 booking：已结算 + 明细
      await tx.booking.update({
        where: { id },
        data: {
          splitStatus: 'settled',
          splitDetail: JSON.stringify(breakdown),
        },
        select: { id: true },
      })

      return {
        kind: 'ok' as const,
        settled: true,
        patchedCompletedAt,
        booking: {
          id: booking.id,
          status: STATUS.COMPLETED,
          completedAt: completedAt.toISOString(),
          splitStatus: 'settled',
        },
        ledger,
        breakdown,
      }
    })

    if (result.kind === 'notfound') {
      return NextResponse.json({ ok: false, error: 'Booking not found' }, { status: 404 })
    }
    if (result.kind === 'not_completed') {
      return NextResponse.json({ ok: false, error: 'Booking not completed' }, { status: 409 })
    }
    if (result.kind === 'bad_amount') {
      return NextResponse.json({ ok: false, error: 'Invalid booking amount' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[bookings/settle] error:', err)
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', detail: err?.message },
      { status: 500 },
    )
  }
}
