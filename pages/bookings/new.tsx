import React, { useState } from 'react';
import { useRouter } from 'next/router';
import prisma from '../../lib/prisma';
import type { GetServerSideProps } from 'next';

type Barber = {
  id: number;
  name: string;
  shopId: number;
};

type Shop = {
  id: number;
  name: string;
};

type Service = {
  id: number;
  name: string;
  duration: number;
  price: number;
};

type PageProps = {
  shops: Shop[];
  barbers: Barber[];
  services: Service[];
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const shops = await prisma.shop.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  });

  const barbers = await prisma.barber.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, shopId: true },
  });

  const services = await prisma.service.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, duration: true, price: true },
  });

  return {
    props: {
      shops,
      barbers,
      services,
    },
  };
};

export default function NewBookingPage({
  shops,
  barbers,
  services,
}: PageProps) {
  const router = useRouter();

  const [shopId, setShopId] = useState<number | ''>('');
  const [barberId, setBarberId] = useState<number | ''>('');
  const [serviceId, setServiceId] = useState<number | ''>('');
  const [userName, setUserName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(''); // YYYY-MM-DD
  const [time, setTime] = useState(''); // HH:mm
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filteredBarbers =
    shopId === ''
      ? []
      : barbers.filter((b) => b.shopId === shopId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (
      !userName ||
      !shopId ||
      !barberId ||
      !serviceId ||
      !date ||
      !time
    ) {
      setMessage('门店、理发师、服务、姓名、日期、时间都要填');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName,
          phone,
          shopId,
          barberId,
          serviceId,
          date,
          time,
        }),
      });

      const data = await res.json();

            if (!res.ok || !data.success) {
        setMessage(data.message || '预约失败，请稍后重试');
        return;
      }

      // 成功：先给个提示，然后跳转到预约列表
      setMessage('预约创建成功，正在跳转到预约列表…');

      // 这里不必等太长，直接跳转
      router.push('/bookings');
      return;

    } catch (error) {
      console.error(error);
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6">
        <h1 className="text-xl font-bold mb-4">新建预约</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 门店 */}
          <div>
            <label className="block mb-1 text-xs font-medium">
              门店 *
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={shopId}
              onChange={(e) => {
                const value = e.target.value;
                setShopId(value ? Number(value) : '');
                setBarberId('');
              }}
            >
              <option value="">请选择门店</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>

          {/* 理发师 */}
          <div>
            <label className="block mb-1 text-xs font-medium">
              理发师 *
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={barberId}
              onChange={(e) =>
                setBarberId(e.target.value ? Number(e.target.value) : '')
              }
              disabled={shopId === ''}
            >
              <option value="">请选择理发师</option>
              {filteredBarbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
          </div>

          {/* 服务项目 */}
          <div>
            <label className="block mb-1 text-xs font-medium">
              服务项目 *
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={serviceId}
              onChange={(e) =>
                setServiceId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">请选择服务项目</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.duration} 分钟 / ￥{s.price}）
                </option>
              ))}
            </select>
          </div>

          {/* 日期时间 */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block mb-1 text-xs font-medium">
                日期 *
              </label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1 text-xs font-medium">
                时间 *
              </label>
              <input
                type="time"
                className="w-full border rounded px-3 py-2 text-sm"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* 客户信息 */}
          <div>
            <label className="block mb-1 text-xs font-medium">
              客户姓名 *
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="例如：张三"
            />
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium">
              客户电话（可选）
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="例如：13800000000"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-60"
          >
            {loading ? '创建中…' : '创建预约'}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-xs text-center text-gray-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
