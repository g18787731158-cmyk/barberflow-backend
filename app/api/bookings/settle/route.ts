import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

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

const LEDGER_TYPE_SETTLE = 'SETTLE'
const LEDGER_STATUS_CREATED = 'CREATED'
const LEDGER_STATUS_SUCCESS = 'SUCCESS'
const LEDGER_STATUS_FAILED = 'FAILED'

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
        select: {
          id: true,
          status: true,
          completedAt: true,
          updatedAt: true,
          payAmount: true,
          payStatus: true,
          service: { select: { price: true } },
        },
      })

      if (!booking) return { notFound: true as const }

      const status = String(booking.status ?? '').toUpperCase()
      if (status !== 'COMPLETED') {
        return { badStatus: true as const, status: booking.status }
      }

      // 1) 幂等补写 completedAt（不覆盖已有）
      let patchedCompletedAt = false
      if (!booking.completedAt) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { completedAt: now },
        })
        patchedCompletedAt = true
      }

      // 2) 准备一条 SETTLE 流水（幂等）
      const amount = Number(booking.payAmount ?? 0) > 0 ? Number(booking.payAmount) : Number(booking.service?.price ?? 0)

      const existingLedger = await tx.ledger.findUnique({
        where: { bookingId_type: { bookingId, type: LEDGER_TYPE_SETTLE } },
        select: { id: true, status: true, amount: true },
      })

      let ledgerPatched = false
      if (!existingLedger) {
        await tx.ledger.create({
          data: {
            bookingId,
            type: LEDGER_TYPE_SETTLE,
            amount,
            status: LEDGER_STATUS_CREATED,
            detail: null,
          },
        })
        ledgerPatched = true
      } else if (String(existingLedger.status).toUpperCase() !== LEDGER_STATUS_SUCCESS) {
        // 如果之前是 FAILED/CREATED，都统一拉回 CREATED，保证可重试
        await tx.ledger.update({
          where: { bookingId_type: { bookingId, type: LEDGER_TYPE_SETTLE } },
          data: {
            amount,
            status: LEDGER_STATUS_CREATED,
            detail: null,
          },
        })
        ledgerPatched = String(existingLedger.status).toUpperCase() === LEDGER_STATUS_FAILED || existingLedger.amount !== amount
      }

      const fresh = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return {
        ok: true as const,
        patched: patchedCompletedAt || ledgerPatched,
        patchedCompletedAt,
        patchedLedger: ledgerPatched,
        booking: fresh,
      }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ ok: false, error: '预约不存在' }, { status: 404 })
    }
    if ((result as { badStatus?: true }).badStatus) {
      const r = result as { status: unknown }
      return NextResponse.json({ ok: false, error: '仅允许对已完成订单结算', status: r.status }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[settle] error:', e)
    return NextResponse.json({ ok: false, error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
