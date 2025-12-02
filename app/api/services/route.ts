// app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/services
// GET /api/services?barberId=1
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberIdParam = searchParams.get('barberId')

    const barberId = barberIdParam ? Number(barberIdParam) : null

    if (barberIdParam && (!barberId || Number.isNaN(barberId))) {
      return NextResponse.json(
        { success: false, message: 'barberId 不合法' },
        { status: 400 }
      )
    }

    // 1）先拿到所有服务的基础信息（通用价）
    const services = await prisma.service.findMany({
      orderBy: { id: 'asc' },
    })

    // 基础结果：每个服务的“系统默认价”
    // basePrice = 系统基础价（服务表里的 price）
    // price / finalPrice = 当前生效价（默认等于 basePrice）
    let result = services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      basePrice: s.price,
      price: s.price,
      finalPrice: s.price,
    }))

    // 2）如果传了 barberId，再查这个理发师的专属价
    if (barberId) {
      // 这里用的是我们在 schema 里加的 BarberService 表
      // 用来存每个理发师对每个服务的专属价格
      const overrides = await prisma.barberService.findMany({
        where: { barberId },
        select: {
          serviceId: true,
          price: true,
        },
      })

      const map = new Map<number, number>()

      overrides.forEach((o) => {
        if (typeof o.price === 'number') {
          map.set(o.serviceId, o.price)
        }
      })

      // 用 override 覆盖默认价，得到最终价
      result = result.map((s) => {
        const overridePrice = map.get(s.id)
        const finalPrice =
          typeof overridePrice === 'number' ? overridePrice : s.basePrice

        return {
          ...s,
          // 当前生效价
          price: finalPrice,
          finalPrice,
        }
      })
    }

    return NextResponse.json(
      {
        success: true,
        services: result,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/services error', error)
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
