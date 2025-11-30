// app/api/bookings/status/route.ts

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/bookings/status
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 兼容前端传 id 或 bookingId
    const bookingId = body.bookingId ?? body.id
    const status = body.status

    if (!bookingId || !status) {
      return NextResponse.json(
        { success: false, message: '缺少 id 或 status' },
        { status: 400 }
      )
    }

    // 先查一下有没有这条预约
    const existing = await prisma.booking.findUnique({
      where: { id: Number(bookingId) },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, message: `未找到 id=${bookingId} 的预约` },
        { status: 404 }
      )
    }

    // 真正更新状态
    const booking = await prisma.booking.update({
      where: { id: Number(bookingId) },
      data: { status },
    })

    return NextResponse.json(
      { success: true, booking },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('POST /api/bookings/status error', error)
    return NextResponse.json(
      {
        success: false,
        message: '更新预约状态失败，请稍后再试',
        error: String(error),
      },
      { status: 500 }
    )
  }
}
