import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import type { Prisma } from '@/lib/prisma'
import { requireAdminPages } from '@/lib/auth/admin-pages'
import { parseClientTimeToUtcDate, bizDateString, startOfBizDayUtc, endOfBizDayUtc } from '@/lib/tz'

type Tx = Prisma.TransactionClient

const SLOT_MINUTES = 30

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

async function calcFinalPrice(tx: Tx, barberId: number, serviceId: number) {
  const bs = await tx.barberservice.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
    select: { price: true },
  })
  if (bs && typeof bs.price === 'number') return bs.price

  const s = await tx.service.findUnique({
    where: { id: serviceId },
    select: { price: true },
  })
  if (!s) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return s.price
}

async function getServiceDuration(tx: Tx, serviceId: number) {
  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { durationMinutes: true },
  })
  if (!svc) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return svc.durationMinutes ?? SLOT_MINUTES
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAdminPages(req, res)) return

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

    const start = parseClientTimeToUtcDate(startTime)
    if (!start) {
      return res.status(400).json({ success: false, message: 'startTime 不合法' })
    }

    const dateStr = bizDateString(start)
    const lockKey = `bf:barber:${barberIdNum}:${dateStr}`

    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const dayStart = startOfBizDayUtc(dateStr)
        const dayEnd = endOfBizDayUtc(dateStr)

        const duration = await getServiceDuration(tx, serviceIdNum)
        const newEnd = addMinutes(start, duration)

        const exist = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        const conflict = exist.some((b) => {
          const dur = b.service?.durationMinutes ?? SLOT_MINUTES
          const bEnd = addMinutes(b.startTime, dur)
          return start < bEnd && newEnd > b.startTime
        })

        if (conflict) return { kind: 'conflict' as const }

        const finalPrice = await calcFinalPrice(tx, barberIdNum, serviceIdNum)

        const created = await tx.booking.create({
          data: {
            shopId: shopIdNum,
            barberId: barberIdNum,
            serviceId: serviceIdNum,
            userName: String(userName || '匿名客人'),
            phone: phone ? String(phone) : undefined,
            startTime: start,
            status: STATUS.SCHEDULED,
            slotLock: true,
            source: source ? String(source) : 'miniapp',
            price: finalPrice,
          },
          include: { shop: true, barber: true, service: true },
        })

        return { kind: 'ok' as const, booking: created }
      } catch (e: any) {
        if (e?.code === 'P2002') return { kind: 'conflict' as const }
        throw e
      } finally {
        try {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey}) AS released`
        } catch (e) {
          console.error('RELEASE_LOCK failed:', e)
        }
      }
    })

    if (result.kind === 'busy') {
      return res.status(503).json({ success: false, message: '系统繁忙，请稍后再试' })
    }
    if (result.kind === 'conflict') {
      return res.status(409).json({ success: false, message: '该时间段已被预约，请选择其他时间' })
    }

    return res.status(200).json({ success: true, booking: result.booking })
  } catch (e: any) {
    console.error('create booking error:', e)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}
