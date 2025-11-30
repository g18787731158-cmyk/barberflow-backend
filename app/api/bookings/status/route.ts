// app/api/bookings/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/bookings/status  { id, status }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status } = body || {}

    if (!id || !status) {
      return NextResponse.json(
        { success: false, message: '缺少 id 或 status' },
        { status: 400 }
      )
    }

    const bookingId = Number(id)
    if (Number.isNaN(bookingId)) {
      return NextResponse.json(
        { success: false, message: 'id 格式不正确' },
        { status: 400 }
      )
    }

    // 可以先简单限制一下可选状态
    const allowed = ['scheduled', 'pending', 'completed', 'cancelled']
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { success: false, message: `不支持的状态：${status}` },
        { status: 400 }
      )
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    })

    return NextResponse.json(
      { success: true, booking: updated },
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
