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

function normalizeStatus(input: unknown): 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | null {
  const s = String(input ?? '').trim().toUpperCase()
  if (!s) return null
  if (s === 'SCHEDULED' || s === 'SCHEDULE') return 'SCHEDULED'
  if (s === 'CONFIRMED' || s === 'CONFIRM') return 'CONFIRMED'
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return 'CANCELLED'
  if (s === 'COMPLETED' || s === 'COMPLETE') return 'COMPLETED'
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
  const nextStatus = normalizeStatus(body.status)
  if (!bookingId) return NextResponse.json({ ok: false, error: 'bookingId is required' }, { status: 400 })
  if (!nextStatus) return NextResponse.json({ ok: false, error: 'status 无效（仅支持 SCHEDULED/CONFIRMED/CANCELLED/COMPLETED）' }, { status: 400 })

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true, splitStatus: true },
      })
      if (!booking) return { notFound: true as const }

      const ledger = await tx.ledger.findUnique({
        where: { bookingId_type: { bookingId, type: LEDGER_TYPE_SETTLE } },
        select: { status: true },
      })

      // ✅ 已结算成功的单：不允许从 COMPLETED 回退（避免财务灾难）
      if (nextStatus !== 'COMPLETED' && ledger && String(ledger.status).toUpperCase() === LEDGER_STATUS_SUCCESS) {
        return { conflict: true as const }
      }

      let changed = false

      if (nextStatus === 'COMPLETED') {
        // 1) completedAt 幂等补写
        const needSetCompletedAt = !booking.completedAt
        // 2) 如果之前因为回退把流水置 FAILED，再次完成时拉回 CREATED（可重试）
        const needResetLedger =
          ledger && String(ledger.status).toUpperCase() === LEDGER_STATUS_FAILED

        if (needSetCompletedAt || String(booking.status).toUpperCase() !== 'COMPLETED') {
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              status: nextStatus,
              completedAt: needSetCompletedAt ? now : booking.completedAt,
            },
          })
          changed = true
        }

        if (needResetLedger) {
          await tx.ledger.update({
            where: { bookingId_type: { bookingId, type: LEDGER_TYPE_SETTLE } },
            data: { status: LEDGER_STATUS_CREATED, detail: null },
          })
          changed = true
        }
      } else {
        // 回退：清空 completedAt + splitStatus 归位
        if (String(booking.status).toUpperCase() !== nextStatus || booking.completedAt !== null || (booking.splitStatus ?? '') !== 'pending') {
          await tx.booking.update({
            where: { id: bookingId },
            data: {
              status: nextStatus,
              completedAt: null,
              splitStatus: 'pending',
            },
          })
          changed = true
        }

        // 若存在 SETTLE 流水且未成功结算，则标记 FAILED（留下审计痕迹）
        if (ledger && String(ledger.status).toUpperCase() !== LEDGER_STATUS_SUCCESS) {
          await tx.ledger.update({
            where: { bookingId_type: { bookingId, type: LEDGER_TYPE_SETTLE } },
            data: {
              status: LEDGER_STATUS_FAILED,
              detail: JSON.stringify({ reason: 'STATUS_CHANGED', to: nextStatus, at: now.toISOString() }),
            },
          })
          changed = true
        }
      }

      const fresh = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { ok: true as const, changed, booking: fresh }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ ok: false, error: '预约不存在' }, { status: 404 })
    }
    if ((result as { conflict?: true }).conflict) {
      return NextResponse.json(
        { ok: false, error: '该订单已结算成功，禁止回退状态；如需更正请先做退款/冲正' },
        { status: 409 },
      )
    }

    return NextResponse.json(result)
  } catch (e) {
    console.error('[status] error:', e)
    return NextResponse.json({ ok: false, error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
