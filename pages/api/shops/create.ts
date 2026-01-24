import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { requireAdminPages } from '@/lib/auth/admin-pages';

type Data =
  | {
      success: true;
      message: string;
      shop: any;
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
    const { name, address } = req.body;

    // 1. 校验必填字段
    if (!name || !address) {
      return res.status(400).json({
        success: false,
        message: 'name 和 address 都是必填的',
      });
    }

    // 2. 写入数据库
    // ⚠️ 如果你的模型不是 `model Shop`，
    // 比如是 `model BarberShop`，就改成 prisma.barberShop.create(...)
    const shop = await prisma.shop.create({
      data: {
        name,
        address,
      },
    });

    // 3. 返回创建好的数据
    return res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      shop,
    });
  } catch (error: any) {
    console.error('Error creating shop:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error when creating shop',
    });
  }
}
