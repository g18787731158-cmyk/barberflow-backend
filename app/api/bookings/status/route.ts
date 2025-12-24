import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { canonStatus, STATUS, type CanonStatus } from '@/lib/status'

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

function toCanon(v: unknown): CanonStatus | null {
  const c = canonStatus(v)
  return c === 'UNKNOWN' ? null : (c as CanonStatus)
}

// 更新预约状态（幂等 + 全大写 + 自动维护 completedAt）
export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.bookingId ?? body.id)
  if (!bookingId) {
    return NextResponse.json({ error: '缺少有效的 bookingId' }, { status: 400 })
  }

  const target = toCanon(body.status)
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

      // 当前状态统一成大写（未知就按原样 upper）
      const curCanon = toCanon(existing.status) ?? String(existing.status ?? '').trim().toUpperCase()

      // 目标 completedAt：只有 COMPLETED 才保留/写入时间，其余一律清空
      const nextCompletedAt =
        target === STATUS.COMPLETED ? (existing.completedAt ?? now) : null

      const sameStatus = curCanon === target
      const sameCompletedAt =
        (existing.completedAt?.getTime() ?? 0) === (nextCompletedAt?.getTime() ?? 0)

      if (sameStatus && sameCompletedAt) {
        return { changed: false as const, booking: existing }
      }

      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: target, // ✅ 写入全大写
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
    console.error('[bookings/status] error:', e)
    return NextResponse.json({ ok: false, error: '更新状态失败' }, { status: 500 })
  }
}
