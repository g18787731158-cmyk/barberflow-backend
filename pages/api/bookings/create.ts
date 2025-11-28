import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

type Data =
  | { success: true; booking: any }
  | { success: false; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    const {
      shopId,
      barberId,
      serviceId,
      date,
      time,
      userName,
      phone,
    } = req.body as {
      shopId?: string | number;
      barberId?: string | number;
      serviceId?: string | number;
      date?: string;
      time?: string;
      userName?: string;
      phone?: string;
    };

    // 1. 基本校验
    if (
      !shopId ||
      !barberId ||
      !serviceId ||
      !date ||
      !time ||
      !userName
    ) {
      return res.status(400).json({
        success: false,
        message: '门店、理发师、项目、日期、时间、客户姓名都是必填的',
      });
    }

    const shopIdNum = Number(shopId);
    const barberIdNum = Number(barberId);
    const serviceIdNum = Number(serviceId);

    if (
      Number.isNaN(shopIdNum) ||
      Number.isNaN(barberIdNum) ||
      Number.isNaN(serviceIdNum)
    ) {
      return res.status(400).json({
        success: false,
        message: '门店 / 理发师 / 项目 ID 无效',
      });
    }

    // 2. 解析日期时间
    const isoString = `${date}T${time}:00`;
    const startTime = new Date(isoString);

    if (Number.isNaN(startTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: '日期或时间格式不正确',
      });
    }

    // 3. 可选：检查关联是否存在
    const [shop, barber, service] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shopIdNum } }),
      prisma.barber.findUnique({ where: { id: barberIdNum } }),
      prisma.service.findUnique({ where: { id: serviceIdNum } }),
    ]);

    if (!shop) {
      return res
        .status(400)
        .json({ success: false, message: '门店不存在' });
    }
    if (!barber) {
      return res
        .status(400)
        .json({ success: false, message: '理发师不存在' });
    }
    if (!service) {
      return res
        .status(400)
        .json({ success: false, message: '服务项目不存在' });
    }

    // 4. 写入数据库（注意 status: 'scheduled'）
    const booking = await prisma.booking.create({
      data: {
        userName,
        phone: phone || null,
        shopId: shopIdNum,
        barberId: barberIdNum,
        serviceId: serviceIdNum,
        startTime,
        status: 'scheduled', // 新建预约默认「待服务」
      },
    });

    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error('Error creating booking:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' });
  }
}
