import React, { useState } from 'react'
import { useRouter } from 'next/router'
import type { GetServerSideProps } from 'next'
import { prisma } from '../../lib/prisma'

type Service = {
  id: number
  name: string
  durationMinutes: number
  price: number
}

type PageProps = {
  services: Service[]
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const services = await prisma.service.findMany({
    orderBy: { id: 'asc' },
  })

  return {
    props: {
      services: services.map((s:any) => ({
        id: s.id,
        name: s.name,
        // ✅ 用 durationMinutes，和 schema 对齐
        durationMinutes: s.durationMinutes,
        price: s.price,
      })),
    },
  }
}

export default function ServicesPage({ services }: PageProps) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [durationMinutes, setDuration] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!name || !durationMinutes || !price) {
      setMessage('项目名、时长、价格都要填')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/services/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          duration: Number(durationMinutes),
          price: Number(price),
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setMessage(data.message || '创建失败，请稍后重试')
        return
      }

      setMessage('创建成功！')
      setName('')
      setDuration('')
      setPrice('')

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
        <h1 className="text-xl font-bold mb-4">服务项目管理</h1>

        {/* 服务列表 */}
        {services.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            目前还没有服务项目，可以在下面新增。
          </p>
        ) : (
          <ul className="space-y-3 mb-6">
            {services.map((s) => (
              <li
                key={s.id}
                className="border rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    时长：{s.durationMinutes} 分钟 · 价格：￥{s.price}
                  </div>
                </div>
                <span className="text-xs text-gray-400">ID: {s.id}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 新增服务项目表单 */}
        <div className="border-t pt-4 mt-4">
          <h2 className="text-sm font-semibold mb-3">新增服务项目</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block mb-1 text-xs font-medium">
                项目名称 *
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：男士剪发 / 烫发 / 染发"
              />
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium">
                时长（分钟） *
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={durationMinutes}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="例如：45"
                type="number"
                min={1}
              />
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium">
                价格（元） *
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例如：80"
                type="number"
                min={0}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-60"
            >
              {loading ? '创建中…' : '创建服务项目'}
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
