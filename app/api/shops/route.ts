// app/api/shops/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 列出所有门店
export async function GET() {
  try {
    const shops = await prisma.shop.findMany({
      orderBy: { id: 'asc' },
    })
    return NextResponse.json(shops)
  } catch (err) {
    console.error('GET /api/shops error', err)
    return NextResponse.json(
      { message: 'Failed to fetch shops' },
      { status: 500 },
    )
  }
}
