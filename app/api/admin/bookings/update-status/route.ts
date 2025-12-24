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

const CANON = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const

type CanonStatus = (typeof CANON)[keyof typeof CANON]

function normalize(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

function toCanonStatus(v: unknown): CanonStatus | null {
  const s = normalize(v)
  if (!s) return null

  if (s === 'SCHEDULED') return CANON.SCHEDULED
  if (s === 'CONFIRMED') return CANON.CONFIRMED
  if (s === 'COMPLETED') return CANON.COMPLETED
  if (s === 'CANCELLED' || s === 'CANCELED') return CANON.CANCELLED

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

  const target = toCanonStatus(body.status)
  if (!target) {
    return NextResponse.json(
      { error: '无效的预约状态', allowed: Object.values(CANON) },
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

      const cur = normalize(existing.status)
      const curCanon = toCanonStatus(cur) ?? cur

      // 计算目标 completedAt
      const nextCompletedAt =
        target === CANON.COMPLETED ? (existing.completedAt ?? now) : null

      // 幂等：状态一致且 completedAt 已符合
      if (curCanon === target && existing.completedAt === nextCompletedAt) {
        return { changed: false as const, booking: existing }
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
