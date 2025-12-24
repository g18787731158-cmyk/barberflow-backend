import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(_req: NextRequest) {
  const now = new Date()
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  )
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  )

  // 把 service 一起查出来，好算营业额
  const todays = await prisma.booking.findMany({
    where: {
      startTime: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      service: true,
    },
  })

  let total = 0
  let scheduled = 0
  let completed = 0
  let cancelled = 0
  let revenue = 0 // 今日营业额（单位：元）

  let miniapp = 0
  let web = 0
  let other = 0

  for (const b of todays) {
    total += 1

    if (b.status === 'scheduled') scheduled += 1
    else if (b.status === 'completed') completed += 1
    else if (b.status === 'cancelled') cancelled += 1

    if (b.source === 'miniapp') miniapp += 1
    else if (b.source === 'web') web += 1
    else other += 1

    // 营业额：只算已完成的单
    if (b.status === 'completed' && b.service) {
      revenue += b.service.price || 0
    }
  }

  const effective = total - cancelled

  return NextResponse.json({
    date: startOfDay.toISOString().slice(0, 10), // YYYY-MM-DD
    total,
    scheduled,
    completed,
    cancelled,
    effective,
    revenue,
    bySource: {
      miniapp,
      web,
      other,
    },
  })
}
