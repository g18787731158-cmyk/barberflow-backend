import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 标记预约为已完成
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: '请求体必须是 JSON' },
      { status: 400 }
    )
  }

  const { id } = body || {}

  if (!id) {
    return NextResponse.json(
      { error: '缺少预约 id' },
      { status: 400 }
    )
  }

  try {
    const booking = await prisma.booking.update({
      where: { id: Number(id) },
      data: {
        status: 'completed',
      },
      include: {
        service: true,
      },
    })

    return NextResponse.json({ booking })
  } catch (error: any) {
    console.error('标记完成失败:', error)

    // P2025: 记录不存在
    if (error?.code === 'P2025') {
      return NextResponse.json(
        { error: '预约不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: '操作失败，请稍后再试' },
      { status: 500 }
    )
  }
}
