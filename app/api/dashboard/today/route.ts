import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS, normStatus, isCancelled } from '@/lib/status'

export async function GET(_req: NextRequest) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const todays = await prisma.booking.findMany({
    where: {
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    include: { service: true },
  })

  let total = 0
  let scheduled = 0
  let completed = 0
  let cancelled = 0
  let revenue = 0

  let miniapp = 0
  let web = 0
  let other = 0

  for (const b of todays) {
    total += 1

    const st = normStatus(b.status)

    if (st === STATUS.COMPLETED) completed += 1
    else if (isCancelled(b.status)) cancelled += 1
    else if (st === STATUS.SCHEDULED || st === STATUS.CONFIRMED) scheduled += 1

    const src = (b.source || '').toLowerCase()
    if (src === 'miniapp') miniapp += 1
    else if (src === 'web') web += 1
    else other += 1

    // 营业额：只算已完成（✅ 大写）
    if (st === STATUS.COMPLETED && b.service) {
      revenue += b.service.price || 0
    }
  }

  const effective = total - cancelled

  return NextResponse.json({
    date: startOfDay.toISOString().slice(0, 10),
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
