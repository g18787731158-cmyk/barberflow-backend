// app/api/bookings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/prisma'; // 相对路径这样写是没问题的

// 创建预约（给前台 /booking 用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userName,
      phone,
      shopId,
      barberId,
      serviceId,
      startTime, // 前端一般传 ISO 字符串
      status,
      source,
    } = body ?? {};

    // 基础校验
    if (
      !userName ||
      !shopId ||
      !barberId ||
      !serviceId ||
      !startTime
    ) {
      return NextResponse.json(
        {
          success: false,
          message: '姓名、门店、理发师、服务、开始时间都必须填写',
        },
        { status: 400 }
      );
    }

    const shopIdNum = Number(shopId);
    const barberIdNum = Number(barberId);
    const serviceIdNum = Number(serviceId);

    if (
      Number.isNaN(shopIdNum) ||
      Number.isNaN(barberIdNum) ||
      Number.isNaN(serviceIdNum)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: '门店 / 理发师 / 服务 ID 必须是数字',
        },
        { status: 400 }
      );
    }

    // 把前端传来的时间字符串转成 Date
    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: '开始时间格式不正确',
        },
        { status: 400 }
      );
    }

    // 🚨 核心：根据 serviceId 查到价格，用来写入 booking.price
    const service = await prisma.service.findUnique({
      where: { id: serviceIdNum },
      select: { price: true },
    });

    if (!service) {
      return NextResponse.json(
        {
          success: false,
          message: '服务项目不存在',
        },
        { status: 400 }
      );
    }

    // 2. 写入数据库（只传 Prisma 模型存在的字段）
    const booking = await prisma.booking.create({
      data: {
        userName,
        phone: phone || null,
        shopId: shopIdNum,
        barberId: barberIdNum,
        serviceId: serviceIdNum,
        startTime: start,
        status: status ?? 'scheduled',
        source: source ?? 'online',

        // ✅ 新增：价格字段，和 Service.price 对齐
        price: service.price,
      },
    });

    return NextResponse.json(
      {
        success: true,
        booking,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create booking error:', error);
    return NextResponse.json(
      {
        success: false,
        message: '服务器开小差了，请稍后再试',
      },
      { status: 500 }
    );
  }
}
