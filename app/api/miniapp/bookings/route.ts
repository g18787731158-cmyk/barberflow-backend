import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import type { Prisma } from '@/lib/prisma'
import {
  startOfBizDayUtc,
  endOfBizDayUtc,
  parseClientTimeToUtcDate,
  bizDateString,
  addBizDays,
} from '@/lib/tz'

type Tx = Prisma.TransactionClient
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

const SLOT_MINUTES = 30
const MIN_ADVANCE_DAYS = 1

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function buildStartTime(dateStr: string, timeStr: string): Date | null {
  return parseClientTimeToUtcDate(`${dateStr}T${timeStr}:00`)
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

function slotMinutes(timeStr: string, durationMinutes: number) {
  const [hh, mm] = timeStr.split(':').map(Number)
  const start = hh * 60 + mm
  const end = start + durationMinutes
  return { start, end }
}

async function calcFinalPrice(tx: Tx, barberId: number, serviceId: number) {
  const bs = await tx.barberservice.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
    select: { price: true },
  })
  if (bs && typeof bs.price === 'number') return bs.price

  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { price: true },
  })
  if (!svc) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return svc.price
}

async function getServiceDuration(tx: Tx, serviceId: number) {
  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { durationMinutes: true },
  })
  if (!svc) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return svc.durationMinutes ?? SLOT_MINUTES
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
  if (!parseClientTimeToUtcDate(date)) {
    return NextResponse.json({ error: 'date 格式不正确' }, { status: 400 })
  }

  // 今天只能约明天起（按日历天）
  const minDateStr = addBizDays(bizDateString(), MIN_ADVANCE_DAYS)
  if (date < minDateStr) {
    return NextResponse.json({ ok: false, error: '需至少提前一天预约' }, { status: 400 })
  }

  const startTime = buildStartTime(date, time)
  if (!startTime) {
    return NextResponse.json({ error: 'date/time 格式不正确' }, { status: 400 })
  }

  // “理发师 + 日期”做锁（防并发插队）
  const lockKey = `bf:barber:${barberId}:${date}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const dayStart = startOfBizDayUtc(date)
        const dayEnd = endOfBizDayUtc(date)

        const duration = await getServiceDuration(tx, serviceId)
        const newEnd = addMinutes(startTime, duration)

        // ✅ timeoff 强校验（防绕过）
        const timeoffs = await tx.barbertimeoff.findMany({
          where: {
            barberId,
            enabled: true,
            OR: [
              { type: 'DAILY' },
              {
                type: { in: ['DATE_RANGE', 'DATE_PARTIAL'] },
                startAt: { lt: dayEnd },
                endAt: { gt: dayStart },
              },
            ],
          },
          orderBy: { id: 'desc' },
        })

        const { start: sMin, end: eMin } = slotMinutes(time, duration)

        const timeoffConflict = timeoffs.some((t) => {
          if (t.type === 'DAILY') {
            if (t.startMinute == null || t.endMinute == null) return false
            return sMin < t.endMinute && eMin > t.startMinute
          }
          if (!t.startAt || !t.endAt) return false
          return overlaps(startTime, newEnd, t.startAt, t.endAt)
        })
        if (timeoffConflict) return { kind: 'conflict' as const }

        // 查当天所有“仍占用时段”的单
        const exist = await tx.booking.findMany({
          where: {
            barberId,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        const conflict = exist.some((b) => {
          const dur = b.service?.durationMinutes ?? SLOT_MINUTES
          const bEnd = addMinutes(b.startTime, dur)
          return overlaps(startTime, newEnd, b.startTime, bEnd)
        })
        if (conflict) return { kind: 'conflict' as const }

        const finalPrice = await calcFinalPrice(tx, barberId, serviceId)

        const booking = await tx.booking.create({
          data: {
            shopId,
            barberId,
            serviceId,
            startTime,

            status: STATUS.SCHEDULED,
            slotLock: true,

            userName,
            phone,
            source: 'miniapp',

            price: finalPrice,
            payStatus: 'unpaid',
            payAmount: finalPrice,

            splitStatus: 'pending',
          },
          include: { shop: true, barber: true, service: true },
        })

        return { kind: 'ok' as const, booking }
      } catch (e: any) {
        if (e?.code === 'P2002') return { kind: 'conflict' as const }
        throw e
      } finally {
        try {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey}) AS released`
        } catch (e) {
          console.error('RELEASE_LOCK failed:', e)
        }
      }
    })

    if (result.kind === 'busy') {
      return NextResponse.json({ ok: false, error: '系统繁忙，请稍后再试' }, { status: 503 })
    }
    if (result.kind === 'conflict') {
      return NextResponse.json({ ok: false, error: '该时段不可约' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, booking: result.booking }, { status: 201 })
  } catch (e) {
    console.error('[miniapp/bookings] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
