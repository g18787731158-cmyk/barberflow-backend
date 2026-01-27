import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }, // params 是 Promise
) {
  const auth = requireAdmin(request)
  if (!auth.ok) return auth.res

  // ✅ 关键：解开 Promise 拿到 id
  const { id: rawId } = await context.params
  const bookingId = Number(rawId)

  if (!rawId || Number.isNaN(bookingId)) {
    return NextResponse.json(
      { error: '无效的预约 ID' },
      { status: 400 },
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch (_err) {
    return NextResponse.json(
      { error: '请求体必须是 JSON' },
      { status: 400 },
    )
  }

  const { status, barberId, startTime } = body ?? {}

  const data: any = {}

  if (typeof status === 'string') {
    data.status = status
  }

  if (typeof barberId === 'number') {
    data.barberId = barberId
  }

  if (typeof startTime === 'string') {
    const d = new Date(startTime)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: '无效的时间格式' },
        { status: 400 },
      )
    }
    data.startTime = d
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: '没有提供可更新的字段' },
      { status: 400 },
    )
  }

  try {
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data,
      include: {
        service: true,
        barber: true,
        shop: true,
      },
    })

    return NextResponse.json({ booking: updated })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { error: '更新预约失败' },
      { status: 500 },
    )
  }
}
