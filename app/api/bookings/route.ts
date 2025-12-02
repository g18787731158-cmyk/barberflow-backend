// app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 工具：根据 barberId + serviceId 算出最终价格
async function calcFinalPrice(barberId: number, serviceId: number) {
  // 1️⃣ 先看理发师对这个服务有没有单独定价
  const bs = await prisma.barberService.findUnique({
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

  // 2️⃣ 没有专属价，就用服务默认价
  const svc = await prisma.service.findUnique({
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
    const {
      shopId,
      barberId,
      serviceId,
      userName,
      phone,
      startTime,
      source,
    } = body

    if (!shopId || !barberId || !serviceId || !userName || !phone || !startTime) {
      return NextResponse.json(
        { success: false, message: '缺少必要字段' },
        { status: 400 },
      )
    }

    const start = new Date(startTime)
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: `startTime 格式不正确: ${startTime}`,
        },
        { status: 400 },
      )
    }

    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)

    // ✅ 冲突检查：忽略已取消的预约
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: barberIdNum,
        startTime: start,
        NOT: { status: 'cancelled' },
      },
    })

    if (conflict) {
      return NextResponse.json(
        {
          success: false,
          message: '该时间段已被预约，请换一个时间',
        },
        { status: 409 },
      )
    }

    // ✅ 计算最终价格：先看 BarberService，再退回 Service.price
    const finalPrice = await calcFinalPrice(barberIdNum, serviceIdNum)

    const booking = await prisma.booking.create({
      data: {
        shopId: Number(shopId),
        barberId: barberIdNum,
        serviceId: serviceIdNum,
        userName,
        phone,
        startTime: start,
        source: source || 'miniapp',
        price: finalPrice, // ✅ 写死在订单里
      },
    })

    return NextResponse.json({ success: true, booking }, { status: 201 })
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
