import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import prisma from '../../lib/prisma';

type Shop = {
  id: number;
  name: string;
  address: string | null;
};

type PageProps = {
  shops: Shop[];
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  // 从数据库取门店
  const shopsFromDb = await prisma.shop.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });

  // 显式标注 s 的类型，避免 “implicitly has any” 问题
  const shops: Shop[] = shopsFromDb.map((s): Shop => ({
    id: s.id,
    name: s.name,
    address: s.address ?? null,
  }));

  return {
    props: {
      shops,
    },
  };
};

export default function ShopsPage({ shops }: PageProps) {
  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">门店列表</h1>
          <Link href="/bookings" className="text-xs text-blue-600 underline">
            ← 返回预约列表
          </Link>
        </div>

        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">
            暂时还没有门店，可以先在数据库里加一两家做测试。
          </p>
        ) : (
          <ul className="space-y-3">
            {shops.map((shop) => (
              <li
                key={shop.id}
                className="border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">{shop.name}</div>
                  {shop.address && (
                    <div className="text-xs text-gray-500 mt-1">
                      地址：{shop.address}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">
                    ID: {shop.id}
                  </div>
                </div>
                <Link
                  href={`/shops/${shop.id}/barbers`}
                  className="text-xs text-blue-600 underline"
                >
                  查看理发师 →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
