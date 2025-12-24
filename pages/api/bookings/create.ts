// pages/api/bookings/create.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@/lib/prisma'

async function calcFinalPrice(barberId: number, serviceId: number) {
  // ✅ 注意：模型名是 barberservice（小写）
  const bs = await prisma.barberservice.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
    select: { price: true },
  })
  if (bs && typeof bs.price === 'number') return bs.price

  const s = await prisma.service.findUnique({
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
    const {
      shopId,
      barberId,
      serviceId,
      userName,
      phone,
      startTime,
      source,
    } = req.body || {}

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

    // 冲突检测：同一理发师同一时间点只能有一单
const exists = await prisma.booking.findFirst({
   where: {
    barberId: barberIdNum,
    startTime: start,
  },
  select: { id: true },
 })


    if (exists) {
      return res.status(409).json({
        success: false,
        message: '该时间段已被预约，请选择其他时间',
      })
    }

    const finalPrice = await calcFinalPrice(barberIdNum, serviceIdNum)

    const created = await prisma.booking.create({
      data: {
        shopId: shopIdNum,
        barberId: barberIdNum,
        serviceId: serviceIdNum,
        userName: String(userName || '匿名客人'),
        phone: phone ? String(phone) : undefined,
        startTime: start,
        status: 'scheduled',
        source: source ? String(source) : 'miniapp',
        price: finalPrice,
        // ✅ updatedAt 不要再传了：schema 里已经 @updatedAt
      },
      include: { shop: true, barber: true, service: true },
    })

    return res.status(200).json({ success: true, booking: created })
  } catch (e: any) {
    console.error('create booking error:', e)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}
