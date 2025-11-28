// app/api/admin/bookings/update-status/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const ALLOWED_STATUS = ['scheduled', 'completed', 'cancelled'] as const

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { id, status } = body || {}

    const bookingId = Number(id)

    if (!bookingId || Number.isNaN(bookingId)) {
      return NextResponse.json(
        { error: '缺少有效的预约 ID' },
        { status: 400 },
      )
    }

    if (!status || !ALLOWED_STATUS.includes(status)) {
      return NextResponse.json(
        { error: '无效的预约状态' },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    })

    return NextResponse.json({ booking })
  } catch (err: any) {
    console.error('POST /api/admin/bookings/update-status error:', err)
    return NextResponse.json(
      { error: err?.message || '更新预约状态失败' },
      { status: 500 },
    )
  }
}
