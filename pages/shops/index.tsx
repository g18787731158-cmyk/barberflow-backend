import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import prisma from '../../lib/prisma';

// ===== 类型定义 =====

type Shop = {
  id: number;
  name: string;
  address: string | null;
};

type PageProps = {
  shops: Shop[];
};

// ===== 服务端：获取门店列表 =====

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  // 只取我们页面真正要用到的字段
  const shopsFromDb = await prisma.shop.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });

  // 明确标注 map 里的 s 类型，避免 “implicitly any”
  const shops: Shop[] = shopsFromDb.map(
    (s: { id: number; name: string; address: string | null }) => ({
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

// ===== 前端页面：门店列表 + 新增门店 =====

export default function ShopsPage({ shops }: PageProps) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!name) {
      setMessage('门店名称必填');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/shops/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          address: address || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessage(data.message || '创建失败，请稍后重试');
        return;
      }

      setMessage('创建成功！');
      setName('');
      setAddress('');

      // 刷新当前页面，让新门店出现在列表里
      router.replace(router.asPath);
    } catch (error) {
      console.error(error);
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">门店管理</h1>
          <span className="text-xs text-gray-500">
            当前门店数：{shops.length}
          </span>
        </div>

        {/* 门店列表 */}
        {shops.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            目前还没有门店，可以在下面新增一个。
          </p>
        ) : (
          <ul className="space-y-3 mb-6">
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
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">ID: {shop.id}</span>
                  <Link
                    href={`/shops/${shop.id}/barbers`}
                    className="text-blue-600 underline"
                  >
                    查看理发师
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* 新增门店表单 */}
        <div className="border-t pt-4 mt-4">
          <h2 className="text-sm font-semibold mb-3">新增门店</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium">
                门店名称 *
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：老郭 · BarberFlow 玉溪店"
              />
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium">
                门店地址（可选）
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="例如：玉溪市中心某某路 88 号"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-60"
            >
              {loading ? '创建中…' : '创建门店'}
            </button>
          </form>

          {message && (
            <p className="mt-3 text-xs text-center text-gray-700">
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
