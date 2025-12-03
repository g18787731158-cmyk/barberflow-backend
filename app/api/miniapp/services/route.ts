// app/api/miniapp/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shopIdParam = searchParams.get('shopId')

    let shopId: number | undefined = undefined
    if (shopIdParam) {
      const n = Number(shopIdParam)
      if (!Number.isNaN(n)) {
        shopId = n
      }
    }

    const services = await prisma.service.findMany({
      where: shopId ? {} : {}, // 你目前 Service 没有 shopId 字段，就先返回全部
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        price: true,
      },
      orderBy: {
        id: 'asc',
      },
    })

    return NextResponse.json({
      services,
    })
  } catch (error) {
    console.error('[miniapp/services] error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
