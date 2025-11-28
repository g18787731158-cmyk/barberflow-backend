import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// 获取理发师列表（可按门店过滤）
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const shopIdParam = searchParams.get('shopId')

  const where: any = {}

  if (shopIdParam) {
    where.shopId = Number(shopIdParam)
  }

  try {
    const barbers = await prisma.barber.findMany({
      where,
      orderBy: { id: 'asc' },
    })

    return NextResponse.json({ barbers })
  } catch (err) {
    console.error('获取理发师列表失败:', err)
    return NextResponse.json(
      { error: '获取理发师列表失败' },
      { status: 500 }
    )
  }
}
