// app/api/miniapp/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 把 "2025-12-06" + "14:30" 拼成一个 Date
function buildStartTime(dateStr: string, timeStr: string): Date {
  // 简单拼：2025-12-06T14:30:00
  // 注意：这是按服务器本地时区来算的，后面如果要做多时区再调优
  return new Date(`${dateStr}T${timeStr}:00`)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[miniapp/bookings] body ===>', body)

    const {
      shopId,
      barberId,
      serviceId,
      date,
      time,
      userName,
      phone,
    } = body || {}

    // 基础校验，缺啥就 400
    if (!shopId || !barberId || !serviceId || !date || !time || !userName || !phone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const shopIdNum = Number(shopId)
    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)

    if (
      Number.isNaN(shopIdNum) ||
      Number.isNaN(barberIdNum) ||
      Number.isNaN(serviceIdNum)
    ) {
      return NextResponse.json(
        { error: 'Invalid id type' },
        { status: 400 }
      )
    }

    const startTime = buildStartTime(date, time)

    const booking = await prisma.booking.create({
      data: {
        shopId: shopIdNum,
        barberId: barberIdNum,
        serviceId: serviceIdNum,
        startTime,
        status: 'pending', // 你的 Prisma 里如果有默认值，也可以不写
        userName,
        phone,
        updatedAt: new Date(), // ⭐ 把必填的 updatedAt 补上
      },
    })

    return NextResponse.json(
      {
        ok: true,
        booking,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[miniapp/bookings] error ===>', err)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
