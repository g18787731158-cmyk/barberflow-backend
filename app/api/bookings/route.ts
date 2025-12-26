// app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

// 工具：根据 barberId + serviceId 算出最终价格（用 tx，保证在事务内）
async function calcFinalPrice(tx: any, barberId: number, serviceId: number) {
  const bs = await tx.barberservice.findUnique({
    where: {
      barberId_serviceId: {
        barberId,
        serviceId,
      },
    },
    select: {
      price: true,
    },
  })

  if (bs && typeof bs.price === 'number') {
    return bs.price
  }

  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { price: true },
  })

  if (!svc) {
    throw new Error(`服务不存在: serviceId=${serviceId}`)
  }

  return svc.price
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
      const start = new Date(`${date}T00:00:00+08:00`)
      const end = new Date(`${date}T23:59:59+08:00`)
      where.startTime = { gte: start, lte: end }
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
        service: { select: { name: true, price: true } },
      },
    })

    return NextResponse.json({ success: true, bookings }, { status: 200 })
  } catch (error) {
    console.error('GET /api/bookings error', error)
    return NextResponse.json(
      {
        success: false,
        message: 'GET 服务器错误',
        error: String(error),
      },
      { status: 500 },
    )
  }
}

// POST /api/bookings  用于创建预约（小程序、网页都能用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { shopId, barberId, serviceId, userName, phone, startTime, source } = body

    if (!shopId || !barberId || !serviceId || !userName || !phone || !startTime) {
      return NextResponse.json({ success: false, message: '缺少必要字段' }, { status: 400 })
    }

    const start = new Date(startTime)
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        { success: false, message: `startTime 格式不正确: ${startTime}` },
        { status: 400 },
      )
    }

    const shopIdNum = Number(shopId)
    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)

    const data = {
      shopId: shopIdNum,
      barberId: barberIdNum,
      serviceId: serviceIdNum,
      userName,
      phone,
      startTime: start,
      source: source || 'miniapp',
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `bf:barber:${barberIdNum}`
      const lockRows =
        await tx.$queryRaw<Array<{ ok: number | null }>>`SELECT GET_LOCK(${lockKey}, 5) AS ok`

      if (lockRows?.[0]?.ok !== 1) {
        return { error: 'LOCK_TIMEOUT' as const }
      }

      try {
        const svc = await tx.service.findUnique({
          where: { id: serviceIdNum },
          select: { durationMinutes: true },
        })
        const duration = svc?.durationMinutes ?? 30

        const newStart = start
        const newEnd = addMinutes(newStart, duration)

        // 只查“同一天” + slotLock=true 的订单（按 newStart 当天算）
        const yyyy = newStart.getFullYear()
        const mm = String(newStart.getMonth() + 1).padStart(2, '0')
        const dd = String(newStart.getDate()).padStart(2, '0')
        const dateStr = `${yyyy}-${mm}-${dd}`

        const dayStart = new Date(`${dateStr}T00:00:00`)
        const dayEnd = new Date(`${dateStr}T23:59:59`)

        const candidates = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
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

        const finalPrice = await calcFinalPrice(tx, barberIdNum, serviceIdNum)

        try {
          const booking = await tx.booking.create({
            data: {
              ...data,
              status: 'SCHEDULED',
              slotLock: true,
              price: finalPrice,
            },
          })
          return { booking }
        } catch (e: any) {
          if (e?.code === 'P2002') return { error: 'SLOT_TAKEN' as const }
          throw e
        }
      } finally {
        await tx.$queryRaw`DO RELEASE_LOCK(${`bf:barber:${barberIdNum}`})`
      }
    })

    if ('error' in result) {
      if (result.error === 'SLOT_TAKEN') {
        return NextResponse.json(
          { success: false, message: '该时间段已被预约，请换一个时间' },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { success: false, message: '系统繁忙，请稍后再试' },
        { status: 503 },
      )
    }

    return NextResponse.json({ success: true, booking: result.booking }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/bookings error', error)
    return NextResponse.json(
      {
        success: false,
        message: '服务器开小差了，请稍后再试',
        error: String(error),
        code: (error && error.code) || null,
        meta: (error && error.meta) || null,
      },
      { status: 500 },
    )
  }
}
