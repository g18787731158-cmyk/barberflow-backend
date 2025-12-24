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

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const id = parseId(body.id)
  const rawStatus = String(body.status || '')
  if (!id) return NextResponse.json({ ok: false, error: '缺少预约 id' }, { status: 400 })
  if (!rawStatus) return NextResponse.json({ ok: false, error: '缺少 status' }, { status: 400 })

  const next = canonStatus(rawStatus) // ✅ 统一大写/兼容旧值
  const now = new Date()

  const isCancel = next === STATUS.CANCELLED
  const isComplete = next === STATUS.COMPLETED

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const cur = await tx.booking.findUnique({
        where: { id },
        select: { id: true, status: true, completedAt: true, slotLock: true },
      })
      if (!cur) return null

      const data: any = {
        status: next,
        // ✅ 取消：解锁（写 NULL，允许无限次取消/重约）
        slotLock: isCancel ? null : true,
      }

      // ✅ 完成：补写 completedAt（幂等）
      if (isComplete) {
        data.completedAt = cur.completedAt ?? now
        data.slotLock = true
      }

      const booking = await tx.booking.update({
        where: { id },
        data,
        include: { shop: true, barber: true, service: true },
      })

      return booking
    })

    if (!updated) {
      return NextResponse.json({ ok: false, error: '预约不存在' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, booking: updated })
  } catch (e: any) {
    console.error('[admin/update-status] error:', e)
    return NextResponse.json({ ok: false, error: '更新失败', code: e?.code || null }, { status: 500 })
  }
}
