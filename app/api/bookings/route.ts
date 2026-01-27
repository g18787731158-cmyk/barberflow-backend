import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/prisma'
import {
  startOfBizDayUtc,
  endOfBizDayUtc,
  parseClientTimeToUtcDate,
  bizDateString,
} from '@/lib/tz'

export const runtime = 'nodejs'

type Tx = Prisma.TransactionClient

const SLOT_MINUTES = 30

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

// ✅ 兜底：没带时区就当中国时间 +08:00（由 tz 统一处理）

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

// GET /api/bookings?date=YYYY-MM-DD&shopId=1&barberId=1&phone=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const shopId = searchParams.get('shopId')
    const barberId = searchParams.get('barberId')
    const phone = searchParams.get('phone')

    const where: any = {}

    if (date) {
      if (!parseClientTimeToUtcDate(date)) {
        return NextResponse.json(
          { success: false, message: 'date 格式不正确' },
          { status: 400 },
        )
      }
      const start = startOfBizDayUtc(date)
      const end = endOfBizDayUtc(date)
      where.startTime = { gte: start, lt: end }
    }
    if (shopId) where.shopId = Number(shopId)
    if (barberId) where.barberId = Number(barberId)
    if (phone) where.phone = String(phone)

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        shop: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true, price: true, durationMinutes: true } },
      },
    })

    return NextResponse.json({ success: true, bookings }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/bookings] error', error)
    return NextResponse.json(
      { success: false, message: 'GET 服务器错误', error: String(error) },
      { status: 500 },
    )
  }
}

// POST /api/bookings  创建预约（网页/小程序/门店）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const { shopId, barberId, serviceId, userName, phone, startTime, source } = body || {}

    // ✅ 护栏 1：startTime 必须是 string（否则你会看到“后端收到 1”但不知道谁传的）
    if (typeof startTime !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: 'startTime 必须是字符串（YYYY-MM-DDTHH:mm:ss 或带 +08:00）',
          gotType: typeof startTime,
          got: startTime,
        },
        { status: 400 },
      )
    }

    // ✅ phone 改为可选：不再强制必填
    if (!shopId || !barberId || !serviceId || !userName || !startTime) {
      return NextResponse.json({ success: false, message: '缺少必要字段' }, { status: 400 })
    }

    const start = parseClientTimeToUtcDate(startTime)
    if (!start) {
      // ✅ 护栏 2：把收到的 startTime 原样回给你，方便定位前端哪里变形了
      return NextResponse.json(
        { success: false, message: 'startTime 格式不正确', got: startTime },
        { status: 400 },
      )
    }

    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)
    const shopIdNum = Number(shopId)

    if ([barberIdNum, serviceIdNum, shopIdNum].some((n) => Number.isNaN(n) || n <= 0)) {
      return NextResponse.json(
        { success: false, message: 'shopId/barberId/serviceId 非法' },
        { status: 400 },
      )
    }

    // ✅ 锁按中国日期切
    const dateStrCN = bizDateString(start)
    const lockKey = `bf:barber:${barberIdNum}:${dateStrCN}`

    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const dayStart = startOfBizDayUtc(dateStrCN)
        const dayEnd = endOfBizDayUtc(dateStrCN)

        const duration = await getServiceDuration(tx, serviceIdNum)
        const newEnd = addMinutes(start, duration)

        const exist = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
            // ✅ 同时兼容两种拼法（你项目里两个都出现过）
            status: { notIn: ['CANCELLED', 'CANCELED'] as any },
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        const conflict = exist.some((b) => {
          const dur = b.service?.durationMinutes ?? SLOT_MINUTES
          const bEnd = addMinutes(b.startTime, dur)
          return start < bEnd && newEnd > b.startTime
        })
        if (conflict) return { kind: 'conflict' as const }

        const finalPrice = await calcFinalPrice(tx, barberIdNum, serviceIdNum)

        const booking = await tx.booking.create({
          data: {
            shopId: shopIdNum,
            barberId: barberIdNum,
            serviceId: serviceIdNum,
            userName: String(userName),
            phone: phone ? String(phone) : null,
            startTime: start,
            source: source || 'web',
            status: 'SCHEDULED',
            slotLock: true,
            price: finalPrice,
          },
        })

        return { kind: 'ok' as const, booking }
      } catch (e: any) {
        if (e?.code === 'P2002') return { kind: 'conflict' as const }
        throw e
      } finally {
        try {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey}) AS released`
        } catch (e) {
          console.error('[bookings] RELEASE_LOCK failed:', e)
        }
      }
    })

    if (result.kind === 'busy') {
      return NextResponse.json({ success: false, message: '系统繁忙，请稍后再试' }, { status: 503 })
    }
    if (result.kind === 'conflict') {
      return NextResponse.json({ success: false, message: '该时间段已被预约，请换一个时间' }, { status: 409 })
    }

    return NextResponse.json({ success: true, booking: result.booking }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/bookings] error', error)
    return NextResponse.json(
      { success: false, message: '服务器开小差了，请稍后再试', error: String(error) },
      { status: 500 },
    )
  }
}
