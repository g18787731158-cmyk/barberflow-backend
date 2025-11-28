import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// 创建预约（带防撞单 + 来源）
export async function POST(req: NextRequest) {
  let body: any = {}

  // 1. 解析 JSON
  try {
    body = await req.json()
  } catch (err) {
    return NextResponse.json(
      { error: '请求体必须是 JSON' },
      { status: 400 }
    )
  }

  const {
    userName,
    phone,
    shopId,
    barberId,
    serviceId,
    startTime,
    source, // 可以是 miniapp / web / admin，也可以不传
  } = body || {}

  // 2. 基础校验
  if (!userName || typeof userName !== 'string') {
    return NextResponse.json(
      { error: '请填写姓名' },
      { status: 400 }
    )
  }

  if (!phone || typeof phone !== 'string') {
    return NextResponse.json(
      { error: '请填写手机号' },
      { status: 400 }
    )
  }

  if (!shopId || !barberId || !serviceId) {
    return NextResponse.json(
      { error: '缺少 shopId / barberId / serviceId' },
      { status: 400 }
    )
  }

  if (!startTime || typeof startTime !== 'string') {
    return NextResponse.json(
      { error: '缺少 startTime' },
      { status: 400 }
    )
  }

  const start = new Date(startTime)
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { error: 'startTime 格式不正确' },
      { status: 400 }
    )
  }

  // source 可选，确保是字符串或 null
  const safeSource =
    typeof source === 'string' && source.trim() ? source.trim() : null

  // 3. 写入数据库
  try {
    const booking = await prisma.booking.create({
      data: {
        userName,
        phone,
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        startTime: start,
        source: safeSource, // ✅ 新增：来源字段
      },
    })

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('创建预约失败:', error)

    // ✳️ 关键：拦截唯一约束错误（撞单）
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: '该时间段已被预约，请换一个时间' },
        { status: 409 }
      )
    }

    // 其他错误
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    )
  }
}

// 按手机号查询“我的预约”
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json(
      { error: '缺少手机号参数 phone' },
      { status: 400 }
    )
  }

  const bookings = await prisma.booking.findMany({
    where: { phone },
    orderBy: { startTime: 'asc' },
    include: {
      shop: true,
      barber: true,
      service: true,
    },
  })

  return NextResponse.json({ bookings })
}
