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

      const cur = canonStatus(existing.status)

      // ✅ 已完成不允许取消（防止完成/结算后被取消）
      if (cur === STATUS.COMPLETED) {
        return { conflict: true as const, booking: existing }
      }

      // ✅ 已取消：矫正状态为 CANCELLED，并确保 completedAt=null
      if (cur === STATUS.CANCELLED) {
        const needFixStatus = String(existing.status ?? '').trim().toUpperCase() !== STATUS.CANCELLED
        const needFixCompletedAt = existing.completedAt !== null

        if (!needFixStatus && !needFixCompletedAt) {
          return { changed: false as const, booking: existing }
        }

        const booking = await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: STATUS.CANCELLED,
            completedAt: null,
          },
          select: { id: true, status: true, completedAt: true, updatedAt: true },
        })
        return { changed: true as const, booking }
      }

      // 其它状态 -> 置 CANCELLED + 清 completedAt
      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: STATUS.CANCELLED,
          completedAt: null,
        },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      })

      return { changed: true as const, booking }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ error: '预约不存在' }, { status: 404 })
    }
    if ((result as { conflict?: true }).conflict) {
      return NextResponse.json({ error: '已完成的预约不可取消' }, { status: 409 })
    }

    const ok = result as { changed: boolean; booking: unknown }
    return NextResponse.json({ ok: true, changed: ok.changed, booking: ok.booking })
  } catch (e) {
    console.error('[cancel] error:', e)
    return NextResponse.json({ ok: false, error: '取消失败，请稍后再试' }, { status: 500 })
  }
}
