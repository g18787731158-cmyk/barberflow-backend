// app/api/bookings/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/bookings?date=2025-11-30&shopId=1&barberId=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const shopId = searchParams.get('shopId')
    const barberId = searchParams.get('barberId')

    const where: any = {}

    if (date) {
      // date 形如 2025-11-30
      const start = new Date(`${date}T00:00:00+08:00`)
      const end = new Date(`${date}T23:59:59+08:00`)
      where.startTime = {
        gte: start,
        lte: end,
      }
    }

    if (shopId) where.shopId = Number(shopId)
    if (barberId) where.barberId = Number(barberId)

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        shop: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true } },
      },
    })

    return NextResponse.json({ bookings }, { status: 200 })
  } catch (error) {
    console.error('GET /api/bookings error', error)
    return NextResponse.json(
      { error: '服务器错误，请稍后再试' },
      { status: 500 }
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

    // 基础校验
    if (!shopId || !barberId || !serviceId || !userName || !phone || !startTime) {
      return NextResponse.json(
        { error: '缺少必要字段' },
        { status: 400 }
      )
    }

    // 把 startTime 转成 Date，看是否合法
    const start = new Date(startTime)
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        { error: `startTime 格式不正确: ${startTime}` },
        { status: 400 }
      )
    }

    // 检查是否存在同一理发师、同一时间的预约（简单防冲突）
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: Number(barberId),
        startTime: start,
      },
    })

    if (conflict) {
      return NextResponse.json(
        { error: '该时间段已被预约，请换一个时间' },
        { status: 409 }
      )
    }

    // 创建预约
    const booking = await prisma.booking.create({
      data: {
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        userName,
        phone,
        startTime: start,
        source: source || 'miniapp',
        // 如果你的 Booking 表有 status 且有默认值，就让它用默认值即可
      },
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/bookings error', error)
    return NextResponse.json(
      {
        error: error?.message || '服务器错误，请稍后再试',
      },
      { status: 500 }
    )
  }
}
