import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

function genOrderNo() {
  return `BF${Date.now()}${Math.floor(Math.random() * 1000)}`
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = Number(body?.bookingId)

    if (!bookingId) {
      return NextResponse.json({ ok: false, error: 'bookingId 必填' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        price: true,
        payStatus: true,
        payOrderNo: true,
        payAmount: true,
      },
    })

    if (!booking) {
      return NextResponse.json({ ok: false, error: 'booking 不存在' }, { status: 404 })
    }

    // 已支付直接返回（幂等）
    if (booking.payStatus === 'paid') {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        bookingId: booking.id,
        payStatus: 'paid',
      })
    }

    const amount = Number(booking.payAmount ?? booking.price ?? 0)
    if (!(amount > 0)) {
      return NextResponse.json({ ok: false, error: '订单金额非法' }, { status: 400 })
    }

    const orderNo = booking.payOrderNo || genOrderNo()

    // 先把订单标记成 pending（表示“已发起支付”）
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        payStatus: 'pending',
        payOrderNo: orderNo,
        payAmount: amount,
      },
    })

    // ✅ 先返回 Mock 支付参数（后面换成微信 requestPayment 参数即可）
    return NextResponse.json({
      ok: true,
      mode: 'mock',
      bookingId,
      orderNo,
      amount,
      // 小程序端：收到这个就可以弹“模拟支付确认”
    })
  } catch (e: any) {
    console.error('[miniapp/pay/create] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
