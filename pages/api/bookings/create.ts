// pages/api/bookings/create.(ts|js)
import prisma from '@/lib/prisma'

function buildStartTime(date, time) {
  // date: "2025-12-04", time: "10:00"
  // 拼成 "2025-12-04T10:00:00"
  const iso = `${date}T${time}:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return null
  }
  return d
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' })
  }

  try {
    const {
      shopId,
      barberId,
      serviceId,
      userName,
      phone,
      date,
      time,
      source,
    } = req.body || {}

    // ⭐ 保留你原来的提示逻辑
    if (
      !shopId ||
      !barberId ||
      !serviceId ||
      !userName ||
      !date ||
      !time
    ) {
      return res.status(400).json({
        success: false,
        message: '门店, 理发师, 服务, 姓名, 日期, 时间都要填',
      })
    }

    // 手机号简单兜一下（详细校验前端已经做）
    if (!phone || typeof phone !== 'string' || phone.length < 6) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确',
      })
    }

    const startTime = buildStartTime(date, time)
    if (!startTime) {
      return res.status(400).json({
        success: false,
        message: '时间格式不正确',
      })
    }

    // 查服务价格 & 理发师专属价
    const service = await prisma.service.findUnique({
      where: { id: Number(serviceId) },
      select: {
        price: true,
        durationMinutes: true,
      },
    })

    if (!service) {
      return res.status(400).json({
        success: false,
        message: '服务不存在',
      })
    }

    const barberService = await prisma.barberService.findUnique({
      where: {
        barberId_serviceId: {
          barberId: Number(barberId),
          serviceId: Number(serviceId),
        },
      },
      select: {
        price: true,
      },
    })

    const finalPrice =
      (barberService && barberService.price != null
        ? barberService.price
        : service.price) ?? 0

    // 防止同一理发师同一开始时间重复预约
    const conflict = await prisma.booking.findFirst({
      where: {
        barberId: Number(barberId),
        startTime,
        status: {
          notIn: ['cancelled'],
        },
      },
    })

    if (conflict) {
      return res.status(400).json({
        success: false,
        message: '该时间段已被预约，请选择其他时间',
      })
    }

    const created = await prisma.booking.create({
      data: {
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        userName: String(userName),
        phone: String(phone),
        startTime,
        status: 'scheduled',
        source: source || 'admin', // 小程序会传 miniapp，后台不传也可以
        price: finalPrice,
        payStatus: 'unpaid',
        payAmount: 0,
      },
      include: {
        shop: true,
        barber: true,
        service: true,
      },
    })

    return res.status(200).json({
      success: true,
      booking: created,
    })
  } catch (err) {
    console.error('[pages/api/bookings/create] error:', err)
    return res.status(500).json({
      success: false,
      message: '服务器内部错误',
    })
  }
}
