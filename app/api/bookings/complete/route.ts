import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { booking as BookingModel } from '@prisma/client'

export const runtime = 'nodejs'

type BookingStatus = BookingModel['status']
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

// 标记预约为已完成（幂等 + 自动补写 completedAt）
export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const bookingId = parseId(body.id ?? body.bookingId)
  if (!bookingId) {
    return NextResponse.json({ error: '缺少预约 id' }, { status: 400 })
  }

  const now = new Date()

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, completedAt: true },
      })

      if (!existing) return { notFound: true as const }

      const cur = String(existing.status ?? '').toUpperCase()

      // ✅ 已完成：只补 completedAt（不覆盖已有时间）
      if (cur === 'COMPLETED') {
        if (existing.completedAt) {
          const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { service: true },
          })
          return { changed: false as const, booking }
        }

        const booking = await tx.booking.update({
          where: { id: bookingId },
          data: { completedAt: now },
          include: { service: true },
        })
        return { changed: true as const, booking }
      }

      // 未完成：置完成 + 写 completedAt
      const booking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED' as unknown as BookingStatus,
          completedAt: existing.completedAt ?? now,
        },
        include: { service: true },
      })

      return { changed: true as const, booking }
    })

    if ((result as { notFound?: true }).notFound) {
      return NextResponse.json({ error: '预约不存在' }, { status: 404 })
    }

    const ok = result as { booking: unknown; changed: boolean }
    return NextResponse.json({ booking: ok.booking, changed: ok.changed })
  } catch (e) {
    console.error('[complete] error:', e)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
