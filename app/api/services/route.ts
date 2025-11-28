import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 获取服务列表
export async function GET(req: NextRequest) {
  try {
    const services = await prisma.service.findMany({
      orderBy: { id: 'asc' },
    })

    return NextResponse.json({ services })
  } catch (err) {
    console.error('获取服务列表失败:', err)
    return NextResponse.json(
      { error: '获取服务列表失败' },
      { status: 500 }
    )
  }
}
