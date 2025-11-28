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
    const { id, status } = req.body as {
      id?: number | string;
      status?: string;
    };

    const idNum = Number(id);
    if (!idNum || Number.isNaN(idNum)) {
      return res
        .status(400)
        .json({ success: false, message: '无效的预约 ID' });
    }

    const allowed = ['scheduled', 'completed', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: '无效的预约状态' });
    }

    const booking = await prisma.booking.update({
      where: { id: idNum },
      data: { status },
    });

    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error('Error updating booking status:', err);
    return res
      .status(500)
      .json({ success: false, message: '更新预约状态失败' });
  }
}
