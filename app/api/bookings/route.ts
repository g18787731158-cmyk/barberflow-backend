import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export const runtime = 'nodejs'

const SLOT_MINUTES = 30

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function dateToYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function buildDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0)
  return { start, end }
}

// ✅ 关键：tx 类型必须是 TransactionClient（不是 typeof prisma）
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

// GET /api/bookings?date=2025-11-30&shopId=1&barberId=1&phone=189xxxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const shopId = searchParams.get('shopId')
    const barberId = searchParams.get('barberId')
    const phone = searchParams.get('phone')

    const where: any = {}

    if (date) {
      const { start, end } = buildDayRange(date)
      where.startTime = { gte: start, lt: end }
    }
    if (shopId) where.shopId = Number(shopId)
    if (barberId) where.barberId = Number(barberId)
    if (phone) where.phone = phone

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
    console.error('GET /api/bookings error', error)
    return NextResponse.json(
      { success: false, message: 'GET 服务器错误', error: String(error) },
      { status: 500 },
    )
  }
}

// POST /api/bookings  用于创建预约（小程序、网页都能用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { shopId, barberId, serviceId, userName, phone, startTime, source } = body || {}

    if (!shopId || !barberId || !serviceId || !userName || !phone || !startTime) {
      return NextResponse.json({ success: false, message: '缺少必要字段' }, { status: 400 })
    }

    const start = new Date(String(startTime))
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json(
        { success: false, message: `startTime 格式不正确: ${startTime}` },
        { status: 400 },
      )
    }

    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)
    const shopIdNum = Number(shopId)

    const dateStr = dateToYMD(start)
    const lockKey = `bf:barber:${barberIdNum}:${dateStr}`

    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const { start: dayStart, end: dayEnd } = buildDayRange(dateStr)

        const duration = await getServiceDuration(tx, serviceIdNum)
        const newEnd = addMinutes(start, duration)

        const exist = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
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
            phone: String(phone),
            startTime: start,
            source: source || 'miniapp',
            status: STATUS.SCHEDULED,
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
          console.error('RELEASE_LOCK failed:', e)
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
    console.error('POST /api/bookings error', error)
    return NextResponse.json(
      { success: false, message: '服务器开小差了，请稍后再试', error: String(error) },
      { status: 500 },
    )
  }
}
