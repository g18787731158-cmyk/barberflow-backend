// pages/shops/index.tsx

import React from 'react';
import prisma from '../../lib/prisma';
import type { GetServerSideProps } from 'next';

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
    select: { id: true, name: true, address: true },
  });

  return {
    props: {
      shops: shopsFromDb.map((s): ShopItem => ({
        id: s.id,
        name: s.name,
        address: s.address ?? null,
      })),
    },
  };
};

export default function ShopsPage({ shops }: PageProps) {
  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6">
        <h1 className="text-xl font-bold mb-4">门店列表</h1>

        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">暂时还没有门店。</p>
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
                    地址：{shop.address || '未填写'}
                  </div>
                </div>
                <span className="text-xs text-gray-400">ID: {shop.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
