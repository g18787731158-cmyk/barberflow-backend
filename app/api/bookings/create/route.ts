// app/api/bookings/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function buildStartTime(date: string, time: string) {
  // date: "2025-12-04", time: "10:00"
  // 拼成 "2025-12-04T10:00:00"
  const iso = `${date}T${time}:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return null
  }
  return d
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      shopId,
      barberId,
      serviceId,
      userName,
      phone,
      date,
      time,
      source,
    } = body || {}

    // 基础参数校验（保持原来那句提示）
    if (
      !shopId ||
      !barberId ||
      !serviceId ||
      !userName ||
      !date ||
      !time
    ) {
      return NextResponse.json(
        {
          success: false,
          message: '门店, 理发师, 服务, 姓名, 日期, 时间都要填',
        },
        { status: 400 },
      )
    }

    // 手机号格式简单兜一下（真正校验前端已经做）
    if (!phone || typeof phone !== 'string' || phone.length < 6) {
      return NextResponse.json(
        {
          success: false,
          message: '手机号格式不正确',
        },
        { status: 400 },
      )
    }

    const startTime = buildStartTime(date, time)
    if (!startTime) {
      return NextResponse.json(
        {
          success: false,
          message: '时间格式不正确',
        },
        { status: 400 },
      )
    }

    // 查服务价格 & 理发师专属价
    const service = await prisma.service.findUnique({
      where: { id: Number(serviceId) },
      select: {
        price: true,
        durationMinutes: true,
      },
    })

    if (!service) {
      return NextResponse.json(
        {
          success: false,
          message: '服务不存在',
        },
        { status: 400 },
      )
    }

    const barberService = await prisma.barberService.findUnique({
      where: {
        barberId_serviceId: {
          barberId: Number(barberId),
          serviceId: Number(serviceId),
        },
      },
      select: {
        price: true,
      },
    })

    const finalPrice =
      (barberService && barberService.price != null
        ? barberService.price
        : service.price) ?? 0

    // 检查时间冲突（理发师 + startTime 唯一）
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: Number(barberId),
        startTime: startTime,
        status: {
          notIn: ['cancelled'],
        },
      },
    })

    if (conflict) {
      return NextResponse.json(
        {
          success: false,
          message: '该时间段已被预约，请选择其他时间',
        },
        { status: 400 },
      )
    }

    const created = await prisma.booking.create({
      data: {
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        userName: String(userName),
        phone: String(phone),
        startTime,
        status: 'scheduled',
        source: source || 'admin', // 小程序会传 miniapp，后台可以不传
        price: finalPrice,
        payStatus: 'unpaid',
        payAmount: 0,
      },
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return NextResponse.json(
      {
        success: true,
        booking: created,
      },
      { status: 200 },
    )
  } catch (err) {
    console.error('[bookings/create] error:', err)
    return NextResponse.json(
      {
        success: false,
        message: '服务器内部错误',
      },
      { status: 500 },
    )
  }
}
