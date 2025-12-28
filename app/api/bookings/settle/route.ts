import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS, canonStatus } from '@/lib/status'

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

function clampInt(n: unknown, min: number, max: number, fallback = 0) {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return fallback
  const y = Math.trunc(x)
  if (y < min) return min
  if (y > max) return max
  return y
}

// bps: 200=2%，万分比
function calcFee(amount: number, bps: number) {
  if (amount <= 0 || bps <= 0) return 0
  return Math.floor((amount * bps) / 10000)
}

// 取“订单金额(分)”：price > payAmount > service.price > 0
function getAmountTotal(row: {
  price: number | null
  payAmount: number
  servicePrice: number | null
}) {
  if (typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0) return Math.trunc(row.price)
  if (typeof row.payAmount === 'number' && Number.isFinite(row.payAmount) && row.payAmount > 0) return Math.trunc(row.payAmount)
  if (typeof row.servicePrice === 'number' && Number.isFinite(row.servicePrice) && row.servicePrice > 0) return Math.trunc(row.servicePrice)
  return 0
}

/**
 * settle 目标（务实版）：
 * 1) 只对 COMPLETED 订单结算
 * 2) 确保 completedAt 有值（没有就补）
 * 3) 幂等：同一 booking 只维护一条 ledger(type='SETTLE')
 * 4) ledger.detail 里写明细：总额/平台费/理发师提成/店铺净额
 * 5) 平台抽成默认 0（来自 shop.platformShareBasis，默认就是 0）
 */
export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.bookingId ?? body.id)
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: '缺少预约 id' }, { status: 400 })
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          slotLock: true,
          updatedAt: true,

          shopId: true,
          barberId: true,

          price: true,
          payAmount: true,
          service: { select: { price: true } },
          shop: {
            select: {
              platformShareBasis: true, // bps，默认 0
              barberShareBasis: true,   // bps，默认 0（先留着）
            },
          },
        },
      })

      if (!existing) return { notFound: true as const }

      const st = canonStatus(existing.status)
      if (st !== STATUS.COMPLETED) {
        return {
          ok: true as const,
          settled: false as const,
          reason: 'ONLY_COMPLETED_CAN_SETTLE' as const,
          booking: {
            id: existing.id,
            status: existing.status,
            completedAt: existing.completedAt,
            updatedAt: existing.updatedAt,
          },
        }
      }

      // 1) 补齐 completedAt / slotLock（幂等）
      let patchedCompletedAt = false
      if (!existing.completedAt || existing.slotLock) {
        await tx.booking.update({
          where: { id: existing.id },
          data: {
            completedAt: existing.completedAt ?? now,
            slotLock: false,
          },
        })
        patchedCompletedAt = !existing.completedAt
      }

      // 2) 算金额（分）
      const amountTotal = getAmountTotal({
        price: existing.price ?? null,
        payAmount: existing.payAmount ?? 0,
        servicePrice: existing.service?.price ?? null,
      })

      // 3) 读取费率（bps 万分比），默认 0
      const platformFeeBps = clampInt(existing.shop?.platformShareBasis ?? 0, 0, 10000, 0)
      const barberFeeBps = clampInt(existing.shop?.barberShareBasis ?? 0, 0, 10000, 0)

      // 4) 计算拆分
      const platformFeeAmount = calcFee(amountTotal, platformFeeBps)
      const barberFeeBase = Math.max(0, amountTotal - platformFeeAmount)
      const barberFeeAmount = calcFee(barberFeeBase, barberFeeBps)
      const shopAmount = Math.max(0, amountTotal - platformFeeAmount - barberFeeAmount)

      const breakdown = {
        amountTotal,                 // 订单总额(分)
        platformFeeBps,              // 平台费率(bps)
        platformFeeAmount,           // 平台金额(分)
        barberFeeBps,                // 理发师提成率(bps)
        barberFeeAmount,             // 理发师金额(分)
        shopAmount,                  // 店铺净额(分)
        basis: 'bps/10000',
        computedAt: now.toISOString(),
      }

      // 5) 写入账本（幂等 upsert）
      const ledger = await tx.ledger.upsert({
        where: { bookingId_type: { bookingId: existing.id, type: 'SETTLE' } },
        update: {
          amount: amountTotal,
          detail: JSON.stringify(breakdown),
          status: 'CREATED',
        },
        create: {
          bookingId: existing.id,
          type: 'SETTLE',
          amount: amountTotal,
          status: 'CREATED',
          detail: JSON.stringify(breakdown),
        },
      })

      return {
        ok: true as const,
        settled: true as const,
        patchedCompletedAt,
        booking: {
          id: existing.id,
          status: existing.status,
          completedAt: existing.completedAt ?? now,
        },
        ledger,
        breakdown,
      }
    })

    if ((result as any)?.notFound) {
      return NextResponse.json({ ok: false, error: '预约不存在' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[settle] error:', e)
    return NextResponse.json(
      { ok: false, error: 'settle 失败', code: e?.code || null, detail: e?.message || null },
      { status: 500 },
    )
  }
}
