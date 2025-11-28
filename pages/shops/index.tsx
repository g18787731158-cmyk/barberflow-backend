// pages/shops/index.tsx
import React from 'react';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import prisma from '../../lib/prisma';

type ShopItem = {
  id: number;
  name: string;
  address: string | null;
};

type PageProps = {
  shops: ShopItem[];
};

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const shopsFromDb = await prisma.shop.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });

  // ✅ 显式把 s 声明成 ShopItem，TypeScript 就不会再说 any 了
  const shops: ShopItem[] = shopsFromDb.map(
    (s): ShopItem => ({
      id: s.id,
      name: s.name,
      address: s.address ?? null,
    })
  );

  return {
    props: {
      shops,
    },
  };
};

export default function ShopsPage({ shops }: PageProps) {
  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">门店列表</h1>
          <span className="text-xs text-gray-500">
            当前共 {shops.length} 家门店
          </span>
        </div>

        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">
            目前还没有门店数据，可以先在数据库里建一条测试门店。
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
                  <div className="text-xs text-gray-500 mt-1">
                    {shop.address || '暂无地址'}
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
