import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // 先做管理员校验
  const auth = requireAdmin(req)

  // ✅ 生产环境：未带正确 token 时，直接 404（对外隐藏接口存在）
  if (process.env.NODE_ENV === 'production' && !auth.ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // 非生产环境：按原逻辑返回真实的鉴权错误
  if (!auth.ok) return auth.res

  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = Number(body?.bookingId)

    if (!bookingId) {
      return NextResponse.json({ ok: false, error: 'bookingId 必填' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, payStatus: true },
    })

    if (!booking) {
      return NextResponse.json({ ok: false, error: 'booking 不存在' }, { status: 404 })
    }

    // 幂等：重复回调也 OK
    if (booking.payStatus === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true, bookingId })
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        payStatus: 'paid',
        payTime: new Date(),
      },
    })

    return NextResponse.json({ ok: true, bookingId, payStatus: 'paid' })
  } catch (e: any) {
    console.error('[miniapp/pay/mock-success] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
