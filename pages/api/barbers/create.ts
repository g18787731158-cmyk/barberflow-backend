import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { requireAdminPages } from '@/lib/auth/admin-pages';

type Data =
  | {
      success: true;
      message: string;
      barber: any;
    }
  | {
      success: false;
      message: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (!requireAdminPages(req, res)) return;

  // 只允许 POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { name, shopId } = req.body;

    // 1. 校验必填字段
    if (!name || !shopId) {
      return res.status(400).json({
        success: false,
        message: 'name 和 shopId 都是必填的',
      });
    }

    const shopIdNumber = Number(shopId);

    if (Number.isNaN(shopIdNumber)) {
      return res.status(400).json({
        success: false,
        message: 'shopId 必须是数字',
      });
    }

    // 2. 写入数据库（根据你的 schema.prisma 里的 model Barber）
const barber = await prisma.barber.create({
  data: {
    name,
    shopId: shopIdNumber,
    workStartHour: 10, // 默认早上 10 点上班
    workEndHour: 21,   // 默认晚上 21 点下班
  },
})


    // 3. 返回创建好的数据
    return res.status(201).json({
      success: true,
      message: 'Barber created successfully',
      barber,
    });
  } catch (error: any) {
    console.error('Error creating barber:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error when creating barber',
    });
  }
}
