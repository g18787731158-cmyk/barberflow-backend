import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'
import prisma from '../../../lib/prisma'

type Barber = {
  id: number
  name: string
  level: string | null
}

type ShopWithBarbers = {
  id: number
  name: string
  barbers: Barber[]
}

type PageProps = {
  shop: ShopWithBarbers
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const rawShopId = ctx.params?.shopId as string | undefined
  const shopId = rawShopId ? parseInt(rawShopId, 10) : 0

  if (!shopId) {
    return { notFound: true }
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: {
      barbers: {
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!shop) {
    return { notFound: true }
  }

  return {
    props: {
      shop: {
        id: shop.id,
        name: shop.name,
        barbers: shop.barbers.map((b:any) => ({
          id: b.id,
          name: b.name,
          // 现在数据库里没有 level 字段，先全部给 null，前端类型就不会报错
          level: null,
        })),
      },
    },
  }
}

export default function ShopBarbersPage({ shop }: PageProps) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const barbers = shop.barbers

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!name) {
      setMessage('理发师名字必填')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/barbers/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          level,
          shopId: shop.id,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setMessage(data.message || '创建失败，请稍后重试')
        return
      }

      setMessage('创建成功！')
      setName('')
      setLevel('')

      router.replace(router.asPath)
    } catch (error) {
      console.error(error)
      setMessage('网络异常，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 flex justify-center py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{shop.name} 的理发师</h1>
            <p className="text-xs text-gray-500 mt-1">门店 ID: {shop.id}</p>
          </div>
          <Link href="/shops" className="text-sm text-blue-600 underline">
            ← 返回门店列表
          </Link>
        </div>

        {/* 理发师列表 */}
        {barbers.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            这家店还没有理发师，可以在下面新增。
          </p>
        ) : (
          <ul className="space-y-3 mb-6">
            {barbers.map((barber) => (
              <li
                key={barber.id}
                className="border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">{barber.name}</div>
                  {barber.level && (
                    <div className="text-xs text-gray-500 mt-1">
                      {barber.level}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400">ID: {barber.id}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 新增理发师表单 */}
        <div className="border-t pt-4 mt-4">
          <h2 className="text-sm font-semibold mb-3">新增理发师</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium">
                理发师名称 *
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：老李、Tony、老郭学徒"
              />
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium">
                级别（可选）
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="例如：首席理发师、高级、实习等"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-60"
            >
              {loading ? '创建中…' : '创建理发师'}
            </button>
          </form>

          {message && (
            <p className="mt-3 text-xs text-center text-gray-700">{message}</p>
          )}
        </div>
      </div>
    </main>
  )
}
