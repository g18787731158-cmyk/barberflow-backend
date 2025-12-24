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

function normStatus(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

// 取消预约（幂等 + 写入全大写 + 清 completedAt）
export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.id ?? body.bookingId)
  if (!bookingId) {
    return NextResponse.json({ error: '缺少预约 id' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      if (!existing) return { notFound: true as const }

      const cur = normStatus(existing.status)
      const alreadyCancelled = cur === 'CANCELLED' || cur === 'CANCELED'

      // 幂等：已经取消，只保证 completedAt 为 null
      if (alreadyCancelled) {
        if (existing.completedAt === null) {
          return { changed: false as const, booking: existing }
        }
        const booking = await tx.booking.update({
          where: { id: bookingId },
          data: { completedAt: null },
          select: { id: true, status: true, completedAt: true, updatedAt: true },
        })
        return { changed: true as const, booking }
      }

      // 非取消 -> 置 CANCELLED + 清 completedAt
      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          completedAt: null,
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
    console.error('[cancel] error:', e)
    return NextResponse.json({ ok: false, error: '取消失败，请稍后再试' }, { status: 500 })
  }
}
