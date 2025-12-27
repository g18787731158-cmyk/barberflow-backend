// app/api/miniapp/bookings/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import type { Prisma } from '@prisma/client'

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

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function buildDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0)
  return { start, end }
}

// "2025-12-06" + "14:30" => Date（按服务器时区）
function buildStartTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`)
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

  const startTime = buildStartTime(date, time)
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'date/time 格式不正确' }, { status: 400 })
  }

  // ✅ “理发师 + 日期”做锁（防并发插队）
  const lockKey = `bf:barber:${barberId}:${date}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const { start: dayStart, end: dayEnd } = buildDayRange(date)

        const duration = await getServiceDuration(tx, serviceId)
        const newEnd = addMinutes(startTime, duration)

        // 当天所有“仍占用时段”的单（slotLock=true）
        const exist = await tx.booking.findMany({
          where: {
            barberId,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        // ✅ 重叠判断：90min 不会被插队
        const conflict = exist.some((b) => {
          const dur = b.service?.durationMinutes ?? SLOT_MINUTES
          const bEnd = addMinutes(b.startTime, dur)
          return startTime < bEnd && newEnd > b.startTime
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

            // ✅ 订单金额：写死在订单上
            price: finalPrice,

            // ✅ 支付三件套：从“未支付”开始
            payStatus: 'unpaid',
            payAmount: finalPrice,

            // ✅ 分账状态：先 pending
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
      return NextResponse.json({ ok: false, error: '该时段已被预约' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, booking: result.booking }, { status: 201 })
  } catch (e) {
    console.error('[miniapp/bookings] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
