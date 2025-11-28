import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/bookings
// 用于：
// 1）小程序「我的预约」：根据 phone 查询
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json(
      { error: '缺少手机号 phone' },
      { status: 400 },
    )
  }

  try {
    const bookings = await prisma.booking.findMany({
      where: {
        phone,
      },
      orderBy: {
        startTime: 'asc',
      },
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return NextResponse.json({ bookings })
  } catch (error) {
    console.error('GET /api/bookings error:', error)
    return NextResponse.json(
      { error: '获取预约失败' },
      { status: 500 },
    )
  }
}

// POST /api/bookings
// 用于：
// - 小程序提交预约
// - 后台老板端创建预约（source = 'admin'）
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: '请求体必须是 JSON' },
      { status: 400 },
    )
  }

  const {
    userName,
    phone,
    shopId,
    barberId,
    serviceId,
    startTime,
    source,
  } = body || {}

  // 简单校验
  if (!userName || typeof userName !== 'string') {
    return NextResponse.json(
      { error: '请填写姓名' },
      { status: 400 },
    )
  }

  if (!phone || typeof phone !== 'string') {
    return NextResponse.json(
      { error: '请填写手机号' },
      { status: 400 },
    )
  }

  if (!shopId || !barberId || !serviceId || !startTime) {
    return NextResponse.json(
      { error: '缺少必要字段（门店 / 理发师 / 项目 / 开始时间）' },
      { status: 400 },
    )
  }

  let start: Date
  try {
    start = new Date(startTime)
    if (isNaN(start.getTime())) {
      throw new Error('invalid date')
    }
  } catch {
    return NextResponse.json(
      { error: '开始时间格式不正确' },
      { status: 400 },
    )
  }

  try {
    // 1. 检查这个理发师此时间是否已被占用
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: Number(barberId),
        startTime: start,
        status: { not: 'cancelled' },
      },
    })

    if (conflict) {
      return NextResponse.json(
        { error: '该时间段已被预约，请选择其他时间' },
        { status: 409 },
      )
    }

    // 2. 写入数据库（⚠️ 只传 Prisma 模型里存在的字段）
    const booking = await prisma.booking.create({
      data: {
        userName,
        phone,
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        startTime: start,
        source: source ?? null, // miniapp / web / admin
      },
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('POST /api/bookings error:', error)

    // 唯一键冲突（万一还是撞上）
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: '该时间段已被预约，请换一个时间' },
        { status: 409 },
      )
    }

    return NextResponse.json(
      { error: '创建预约失败，请稍后再试' },
      { status: 500 },
    )
  }
}
