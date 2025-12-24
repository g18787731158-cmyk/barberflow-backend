import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS, canonStatus, type CanonStatus } from '@/lib/status'

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

function toTargetStatus(v: unknown): CanonStatus | null {
  const c = canonStatus(v)
  if (c === 'UNKNOWN') return null
  // 只允许写入这四种
  if (
    c === STATUS.SCHEDULED ||
    c === STATUS.CONFIRMED ||
    c === STATUS.COMPLETED ||
    c === STATUS.CANCELLED
  ) {
    return c
  }
  return null
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.id ?? body.bookingId)
  if (!bookingId) {
    return NextResponse.json({ error: '缺少有效的预约 ID' }, { status: 400 })
  }

  const target = toTargetStatus(body.status)
  if (!target) {
    return NextResponse.json(
      { error: '无效的预约状态', allowed: Object.values(STATUS) },
      { status: 400 },
    )
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })
      if (!existing) return { notFound: true as const }

      const curCanon = canonStatus(existing.status)

      // 目标 completedAt 规则：
      // - COMPLETED：若已有 completedAt 则保持；否则补 now
      // - 其它状态：completedAt 强制为 null
      const nextCompletedAt =
        target === STATUS.COMPLETED ? (existing.completedAt ?? now) : null

      // ✅ 幂等判断（注意：Date 不能用 === 比较）
      const statusSame = curCanon === target
      const completedAtSame =
        (existing.completedAt === null && nextCompletedAt === null) ||
        (existing.completedAt !== null && nextCompletedAt !== null)

      // 如果状态一致，且：
      // - COMPLETED 情况下已有 completedAt
      // - 非 COMPLETED 情况下 completedAt 已是 null
      if (statusSame && completedAtSame) {
        if (target === STATUS.COMPLETED) {
          if (existing.completedAt) return { changed: false as const, booking: existing }
        } else {
          if (existing.completedAt === null) return { changed: false as const, booking: existing }
        }
      }

      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: target,
          completedAt: nextCompletedAt,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { changed: true as const, booking }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ error: '预约不存在' }, { status: 404 })
    }

    const ok = result as { changed: boolean; booking: unknown }
    return NextResponse.json({ ok: true, changed: ok.changed, booking: ok.booking })
  } catch (e) {
    console.error('POST /api/admin/bookings/update-status error:', e)
    return NextResponse.json({ error: '更新预约状态失败' }, { status: 500 })
  }
}
