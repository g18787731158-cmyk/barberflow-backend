import { NextResponse } from 'next/server';
import { transactions } from '../../data/transactions';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const body = await req.json();

  const record = {
    id: randomUUID(),          // 唯一订单ID
    barberId: body.barberId || 'barber_001', // 临时：没传就默认
    shopId: body.shopId || 'shop_001',       // 临时：没传就默认
    ...body,
    timestamp: new Date().toISOString(),
  };

  transactions.push(record);

  return NextResponse.json({
    success: true,
    message: '交易记录已保存',
    record
  });
}