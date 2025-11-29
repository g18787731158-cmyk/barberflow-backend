import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/barbers?shopId=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shopId = searchParams.get('shopId')

    const where: any = {}
    if (shopId) {
      where.shopId = Number(shopId)
    }

    const barbers = await prisma.barber.findMany({
      where,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        shopId: true,
      },
    })

    return NextResponse.json(
      { success: true, barbers },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/barbers error', error)
    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
        error: String(error),
      },
      { status: 500 }
    )
  }
}
