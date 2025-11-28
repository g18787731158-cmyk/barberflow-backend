import Link from 'next/link';
import prisma from '../../lib/prisma';
import type { GetServerSideProps } from 'next';

type ShopsPageProps = {
  shops: {
    id: number;
    name: string;
    address: string | null;
  }[];
};

export const getServerSideProps: GetServerSideProps<ShopsPageProps> = async () => {
  const shops = await prisma.shop.findMany({
    orderBy: { id: 'asc' },
  });

  return {
    props: {
      // 简单起见，直接当成普通对象用
      shops: shops.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address ?? null,
      })),
    },
  };
};

export default function ShopsPage({ shops }: ShopsPageProps) {
  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">门店列表（pages 版）</h1>
          {/* 现在先不做 /shops/new，后面再说 */}
        </div>

        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">目前还没有门店。</p>
        ) : (
          <ul className="space-y-3">
            {shops.map((shop) => {
              const href = `/shops/${shop.id}/barbers`;
              return (
                <li
                  key={shop.id}
                  className="border rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1">
                      DEBUG href = {href}
                    </div>

                    <Link
                      href={href}
                      className="font-medium text-sm hover:underline"
                    >
                      {shop.name}
                    </Link>

                    {shop.address && (
                      <div className="text-xs text-gray-500 mt-1">
                        {shop.address}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    ID: {shop.id}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
