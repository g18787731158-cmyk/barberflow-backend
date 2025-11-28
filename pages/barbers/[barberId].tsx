import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState } from 'react';
import prisma from '../../lib/prisma';

type BookingItem = {
  id: number;
  userName: string;
  phone: string | null;
  startTime: string;
  service: {
    id: number;
    name: string;
    durationMinutes: number;
    price: number;
  };
  shop: {
    id: number;
    name: string;
  };
};

type PageProps = {
  barberId: number;
  barberName: string;
  shopName: string;
  shopId: number;
  dateStr: string; // YYYY-MM-DD
  bookings: BookingItem[];
};

export const getServerSideProps = async (ctx: any) => {
  const { barberId } = ctx.params as { barberId: string };
  const idNum = Number(barberId);

  if (!idNum || Number.isNaN(idNum)) {
    return { notFound: true };
  }

  const queryDate = ctx.query.date as string | undefined;
  const today = new Date();
  const rawDate = queryDate ? new Date(queryDate) : today;
  const isValid = !Number.isNaN(rawDate.getTime());
  const target = isValid ? rawDate : today;

  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const barber = await prisma.barber.findUnique({
    where: { id: idNum },
    include: {
      shop: true,
    },
  });

  if (!barber || !barber.shop) {
    return { notFound: true };
  }

  const bookings = await prisma.booking.findMany({
    where: {
      barberId: idNum,
      startTime: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      startTime: 'asc',
    },
    include: {
      service: true,
      shop: true,
    },
  });

  const dateStr = start.toISOString().slice(0, 10);

  return {
    props: {
      barberId: idNum,
      barberName: barber.name,
      shopName: barber.shop.name,
      shopId: barber.shop.id,
      dateStr,
      // ⭐ 这里加上 b: any，并且字段名用 durationMinutes
      bookings: bookings.map((b: any): BookingItem => ({
        id: b.id,
        userName: b.userName,
        phone: b.phone,
        startTime: b.startTime.toISOString(),
        service: {
          id: b.service.id,
          name: b.service.name,
          durationMinutes: b.service.durationMinutes,
          price: b.service.price,
        },
        shop: {
          id: b.shop.id,
          name: b.shop.name,
        },
      })),
    },
  };
};

export default function BarberSchedulePage({
  barberId,
  barberName,
  shopName,
  shopId,
  dateStr,
  bookings,
}: PageProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleDateChange = (value: string) => {
    if (!value) return;
    setPending(true);
    router
      .push(`/barbers/${barberId}?date=${value}`)
      .finally(() => setPending(false));
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const readableDate = (() => {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${month}月${day}日（周${weekday}）`;
  })();

  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">
              {barberName} 的预约日程
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              门店：{shopName} | 日期：{readableDate}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">选择日期：</label>
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs"
                defaultValue={dateStr}
                onChange={(e) => handleDateChange(e.target.value)}
              />
            </div>
            {pending && (
              <span className="text-[11px] text-gray-400">
                切换日期中…
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <Link
            href={`/shops/${shopId}/barbers`}
            className="text-xs text-blue-600 underline"
          >
            ← 返回门店理发师列表
          </Link>
          <Link
            href="/bookings/new"
            className="text-xs text-blue-600 underline"
          >
            + 新建预约
          </Link>
        </div>

        {bookings.length === 0 ? (
          <p className="text-sm text-gray-500">
            这一天还没有给 {barberName} 的预约。
          </p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li
                key={b.id}
                className="border rounded-lg px-3 py-2 flex items-start justify-between"
              >
                <div>
                  <div className="font-medium text-sm">
                    {formatTime(b.startTime)} — {b.service.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    客户：{b.userName}
                    {b.phone ? `（${b.phone}）` : ''}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{b.service.durationMinutes} 分钟</div>
                  <div>￥{b.service.price}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
