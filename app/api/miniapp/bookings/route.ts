import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS } from '@/lib/status'

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

function parsePosInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

function parseNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

// 把 "2025-12-06" + "14:30" 拼成一个 Date（按服务器时区）
function buildStartTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`)
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const shopId = parsePosInt(body.shopId)
  const barberId = parsePosInt(body.barberId)
  const serviceId = parsePosInt(body.serviceId)
  const date = parseNonEmptyString(body.date)
  const time = parseNonEmptyString(body.time)
  const userName = parseNonEmptyString(body.userName)
  const phone = parseNonEmptyString(body.phone)

  if (!shopId || !barberId || !serviceId || !date || !time || !userName || !phone) {
    return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
  }

  const startTime = buildStartTime(date, time)
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'date/time 格式不正确' }, { status: 400 })
  }

  // 你原来 create 的 data（保持一致）
  const data = {
    shopId,
    barberId,
    serviceId,
    startTime,
    status: STATUS.SCHEDULED,
    userName,
    phone,
    source: 'miniapp' as const,
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `bf:barber:${barberId}`

      const lockRows =
        await tx.$queryRaw<Array<{ ok: number | null }>>`SELECT GET_LOCK(${lockKey}, 5) AS ok`

      if (lockRows?.[0]?.ok !== 1) {
        return { error: 'LOCK_TIMEOUT' as const }
      }

      try {
        // 服务时长（决定 overlap）
        const svc = await tx.service.findUnique({
          where: { id: serviceId },
          select: { durationMinutes: true },
        })
        const duration = svc?.durationMinutes ?? 30

        const newStart = startTime
        const newEnd = addMinutes(newStart, duration)

        // 只查当天 + 只看 slotLock=true 的单
        const dayStart = new Date(`${date}T00:00:00`)
        const dayEnd = new Date(`${date}T23:59:59`)

        const candidates = await tx.booking.findMany({
          where: {
            barberId,
            slotLock: true,
            startTime: { gte: dayStart, lte: dayEnd },
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        const conflict = candidates.find((b) => {
          const d = b.service?.durationMinutes ?? 30
          const bEnd = addMinutes(b.startTime, d)
          return overlaps(b.startTime, bEnd, newStart, newEnd)
        })

        if (conflict) {
          return { error: 'SLOT_TAKEN' as const, conflictId: conflict.id }
        }

        try {
          const booking = await tx.booking.create({
            data: {
              ...data,
              slotLock: true, // ✅ 强制锁住时段
            },
          })
          return { booking }
        } catch (e: any) {
          // 并发兜底：如果你有唯一键，也会走到这里
          if (e?.code === 'P2002') {
            return { error: 'SLOT_TAKEN' as const }
          }
          throw e
        }
      } finally {
        await tx.$queryRaw`DO RELEASE_LOCK(${`bf:barber:${barberId}`})`
      }
    })

    if ('error' in result) {
      if (result.error === 'SLOT_TAKEN') {
        return NextResponse.json({ ok: false, error: '该时段已被预约' }, { status: 409 })
      }
      return NextResponse.json(
        { ok: false, error: '系统繁忙，请稍后再试' },
        { status: 503 },
      )
    }

    return NextResponse.json({ ok: true, booking: result.booking }, { status: 201 })
  } catch (e) {
    console.error('[miniapp/bookings] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
