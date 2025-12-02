// app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/services 或 /api/services?barberId=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdStr = searchParams.get('barberId')
    const barberId = barberIdStr ? Number(barberIdStr) : null

    const services = await prisma.service.findMany({
      orderBy: { id: 'asc' },
    })

    // 基础结果：默认价
    let result = services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      basePrice: s.price,     // 通用价
      price: s.price,         // 默认展示价（可被覆盖）
    }))

    if (barberId) {
      // 拉取这个理发师对各个服务的专属价
      const overrides = await prisma.barberService.findMany({
        where: { barberId },
        select: {
          serviceId: true,
          price: true,
        },
      })

      const map = new Map<number, number | null>()
      overrides.forEach((o) => {
        map.set(o.serviceId, o.price ?? null)
      })

      result = result.map((s) => {
        const override = map.get(s.id)
        if (typeof override === 'number') {
          return {
            ...s,
            price: override, // ✅ 这个理发师的有效价格
          }
        }
        return s
      })
    }

    return NextResponse.json(
      { success: true, services: result },
      { status: 200 },
    )
  } catch (error) {
    console.error('GET /api/services error', error)
    return NextResponse.json(
      {
        success: false,
        message: '服务器错误',
        error: String(error),
      },
      { status: 500 },
    )
  }
}
