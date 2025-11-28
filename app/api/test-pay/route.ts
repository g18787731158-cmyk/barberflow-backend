import { NextResponse } from 'next/server';

export async function POST() {
  // 模拟一笔订单金额 1 元
  const total = 1;

  // 分账比例（可以先写死）
  const platform = +(total * 0.05).toFixed(2); // 平台抽 5%
  const barber = +(total * 0.60).toFixed(2);   // 理发师拿 60%
  const shop = +(total * 0.35).toFixed(2);     // 店铺拿 35%

  return NextResponse.json({
    total,
    platform,
    barber,
    shop,
    success: true
  });
}