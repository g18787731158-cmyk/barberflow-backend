// pages/api/bookings/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

async function calcFinalPrice(tx: any, barberId: number, serviceId: number) {
  const bs = await tx.barberservice.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
    select: { price: true },
  })
  if (bs && typeof bs.price === 'number') return bs.price

  const s = await tx.service.findUnique({
    where: { id: serviceId },
    select: { price: true },
  })
  return s?.price ?? 0
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  try {
    const { shopId, barberId, serviceId, userName, phone, startTime, source } = req.body || {}

    const shopIdNum = Number(shopId)
    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)

    if (!shopIdNum || !barberIdNum || !serviceIdNum || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'shopId / barberId / serviceId / startTime 必填',
      })
    }

    const start = new Date(startTime)
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ success: false, message: 'startTime 不合法' })
    }

    const data = {
      shopId: shopIdNum,
      barberId: barberIdNum,
      serviceId: serviceIdNum,
      userName: String(userName || '匿名客人'),
      phone: phone ? String(phone) : undefined,
      startTime: start,
      status: 'SCHEDULED',
      source: source ? String(source) : 'miniapp',
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockKey = `bf:barber:${barberIdNum}`
      const lockRows =
        await tx.$queryRaw<Array<{ ok: number | null }>>`SELECT GET_LOCK(${lockKey}, 5) AS ok`

      if (lockRows?.[0]?.ok !== 1) return { error: 'LOCK_TIMEOUT' as const }

      try {
        const svc = await tx.service.findUnique({
          where: { id: serviceIdNum },
          select: { durationMinutes: true },
        })
        const duration = svc?.durationMinutes ?? 30
        const newStart = start
        const newEnd = addMinutes(newStart, duration)

        // 只查当天 + slotLock=true
        const yyyy = newStart.getFullYear()
        const mm = String(newStart.getMonth() + 1).padStart(2, '0')
        const dd = String(newStart.getDate()).padStart(2, '0')
        const dateStr = `${yyyy}-${mm}-${dd}`

        const dayStart = new Date(`${dateStr}T00:00:00`)
        const dayEnd = new Date(`${dateStr}T23:59:59`)

        const candidates = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
            slotLock: true,
            startTime: { gte: dayStart, lte: dayEnd },
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        const conflict = candidates.find((b) => {
          const d = b.service?.durationMinutes ?? 30
          const bEnd = addMinutes(b.startTime, d)
          return overlaps(b.startTime, bEnd, newStart, newEnd)
        })

        if (conflict) return { error: 'SLOT_TAKEN' as const, conflictId: conflict.id }

        const finalPrice = await calcFinalPrice(tx, barberIdNum, serviceIdNum)

        try {
          const created = await tx.booking.create({
            data: {
              ...data,
              slotLock: true,
              price: finalPrice,
            },
            include: { shop: true, barber: true, service: true },
          })
          return { created }
        } catch (e: any) {
          if (e?.code === 'P2002') {
            return { error: 'SLOT_TAKEN' as const }
          }
          throw e
        }
      } finally {
        await tx.$queryRaw`DO RELEASE_LOCK(${`bf:barber:${barberIdNum}`})`
      }
    })

    if ('error' in result) {
      const status = result.error === 'SLOT_TAKEN' ? 409 : 503
      const message =
        result.error === 'SLOT_TAKEN'
          ? '该时间段已被预约，请选择其他时间'
          : '系统繁忙，请稍后再试'
      return res.status(status).json({ success: false, message })
    }

    return res.status(200).json({ success: true, booking: result.created })
  } catch (e: any) {
    console.error('create booking error:', e)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}
