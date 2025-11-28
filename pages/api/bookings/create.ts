// pages/api/bookings/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

type Data =
  | { success: true; booking: any }
  | { success: false; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res
      .status(405)
      .json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const {
      userName,
      phone,
      shopId,
      barberId,
      serviceId,
      date, // YYYY-MM-DD
      time, // HH:mm
    } = req.body;

    // 1. 基本校验
    if (!userName || !shopId || !barberId || !serviceId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: '门店、理发师、服务、姓名、日期、时间都要填',
      });
    }

    // 2. 拼出开始时间（这里简单拼接，够用）
    const startTimeStr = `${date}T${time}:00`;
    const startTime = new Date(startTimeStr);
    if (Number.isNaN(startTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: '预约时间不合法',
      });
    }

    // 3. 查服务价格 —— 为了给 Booking.price 字段赋值
    const service = await prisma.service.findUnique({
      where: { id: Number(serviceId) },
      select: { price: true },
    });

    if (!service) {
      return res.status(400).json({
        success: false,
        message: '所选服务不存在',
      });
    }

    // 4. 写入数据库（注意：一定要带上 price）
    const booking = await prisma.booking.create({
      data: {
        userName,
        phone: phone || null,
        shopId: Number(shopId),
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        startTime,
        status: 'scheduled',
        source: 'admin', // 后台创建的订单，标记一下来源
        price: service.price, // ⭐ 关键：给必填字段 price 赋值
      },
    });

    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error('Admin create booking error:', err);
    return res.status(500).json({
      success: false,
      message: '服务器异常，请稍后再试',
    });
  }
}
