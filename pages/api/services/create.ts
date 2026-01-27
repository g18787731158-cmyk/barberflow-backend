import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { requireAdminPages } from '@/lib/auth/admin-pages';

type Data =
  | {
      success: true;
      message: string;
      service: any;
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

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { name, duration, price } = req.body;

    if (!name || duration == null || price == null) {
      return res.status(400).json({
        success: false,
        message: 'name、duration、price 都是必填的',
      });
    }

    const durationNum = Number(duration);
    const priceNum = Number(price);

    if (Number.isNaN(durationNum) || Number.isNaN(priceNum)) {
      return res.status(400).json({
        success: false,
        message: 'duration 和 price 必须是数字',
      });
    }

    const service = await prisma.service.create({
      data: {
  name,
  durationMinutes: durationNum, // ✅ 对应 schema 里的字段名
  price: priceNum,
},

    });

    return res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service,
    });
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error when creating service',
    });
  }
}
