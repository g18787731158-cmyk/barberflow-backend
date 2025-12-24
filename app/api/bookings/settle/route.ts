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

/**
 * settle 的定位（按你现在的 check 输出推断）：
 * - 只要是 COMPLETED，就保证 completedAt 有值（没有就补写）
 * - 幂等：重复调用不报错
 * - （可选）如果你在 settle 里做了 ledger 写入，这里用 upsert 保证不因唯一键冲突 500
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
          updatedAt: true,
          price: true,
          payAmount: true,
          service: { select: { price: true } },
        },
      })

      if (!existing) return { notFound: true as const }

      const st = canonStatus(existing.status)

      // 不是已完成：不做任何事，返回 patched=false
      if (st !== STATUS.COMPLETED) {
        return {
          patched: false as const,
          booking: {
            id: existing.id,
            status: existing.status,
            completedAt: existing.completedAt,
            updatedAt: existing.updatedAt,
          },
        }
      }

      // 已完成 + completedAt 已有：幂等
      if (existing.completedAt) {
        // ✅ 可选：如果 settle 里需要写 ledger，这里 upsert 保证不会 P2002 500
        // 你不需要 ledger 就把这段删掉也行（不影响主逻辑）
        const amount =
          typeof existing.price === 'number'
            ? existing.price
            : typeof existing.payAmount === 'number'
              ? existing.payAmount
              : existing.service?.price ?? 0

        if (amount > 0) {
          await tx.ledger.upsert({
            where: {
              bookingId_type: { bookingId: existing.id, type: 'SETTLE' },
            },
            update: {
              amount,
            },
            create: {
              bookingId: existing.id,
              type: 'SETTLE',
              amount,
              status: 'CREATED',
            },
          })
        }

        return {
          patched: false as const,
          booking: {
            id: existing.id,
            status: existing.status,
            completedAt: existing.completedAt,
            updatedAt: existing.updatedAt,
          },
        }
      }

      // 已完成但缺 completedAt：补写
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { completedAt: now },
        select: { id: true, status: true, completedAt: true, updatedAt: true, price: true, payAmount: true, service: { select: { price: true } } },
      })

      // ✅ 可选：同上，upsert ledger，彻底幂等
      const amount =
        typeof updated.price === 'number'
          ? updated.price
          : typeof updated.payAmount === 'number'
            ? updated.payAmount
            : updated.service?.price ?? 0

      if (amount > 0) {
        await tx.ledger.upsert({
          where: { bookingId_type: { bookingId: updated.id, type: 'SETTLE' } },
          update: { amount },
          create: {
            bookingId: updated.id,
            type: 'SETTLE',
            amount,
            status: 'CREATED',
          },
        })
      }

      return {
        patched: true as const,
        booking: {
          id: updated.id,
          status: updated.status,
          completedAt: updated.completedAt,
          updatedAt: updated.updatedAt,
        },
      }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ ok: false, error: '预约不存在' }, { status: 404 })
    }

    const ok = result as { patched: boolean; booking: unknown }
    return NextResponse.json({ ok: true, patched: ok.patched, booking: ok.booking })
  } catch (e: any) {
    // 如果真是唯一键冲突、或其它 Prisma 错，直接把 code 带出去方便定位
    console.error('[settle] error:', e)
    return NextResponse.json(
      { ok: false, error: 'settle 失败', code: e?.code || null },
      { status: 500 },
    )
  }
}
