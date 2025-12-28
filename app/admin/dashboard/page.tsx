'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type DashboardData = any

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.toISOString().slice(0, 10)}（周${weekday}）`
}

export default function AdminDashboardPage() {
  const [date, setDate] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)

  async function loadDashboard(selectedDate: string) {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/dashboard?date=${selectedDate}`, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`接口错误：${res.status} ${text}`)
      }

      const json = await res.json()
      setData(json)
    } catch (err: any) {
      console.error('加载 dashboard 失败', err)
      setError(err?.message ?? '未知错误')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard(date)
  }, [date])

  const handleChangeDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value)
  }

  const handleToday = () => {
    const d = new Date()
    setDate(d.toISOString().slice(0, 10))
  }

  const handlePrevDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() - 1)
    setDate(d.toISOString().slice(0, 10))
  }

  const handleNextDay = () => {
    const d = new Date(date)
    d.setDate(d.getDate() + 1)
    setDate(d.toISOString().slice(0, 10))
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-6">
      {/* 顶部标题 + 日期控制 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">今日概览</h1>
          <p className="text-sm text-neutral-400">
            一眼看到今天 / 本日预约情况，方便你随时掌握店里节奏
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            前一天
          </button>
          <button
            onClick={handleToday}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            今天
          </button>
          <button
            onClick={handleNextDay}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            后一天
          </button>

          <input
            type="date"
            value={date}
            onChange={handleChangeDate}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* ✅ 快捷入口（新增） */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/settings/shop"
          className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 hover:bg-neutral-800/60 transition"
        >
          <div className="text-sm text-neutral-400 mb-1">设置</div>
          <div className="text-lg font-semibold">店铺设置</div>
          <div className="mt-1 text-sm text-neutral-400">
            配置平台费率 / 理发师提成
          </div>
        </Link>

        <Link
          href="/admin/settlements"
          className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4 hover:bg-neutral-800/60 transition"
        >
          <div className="text-sm text-neutral-400 mb-1">账本</div>
          <div className="text-lg font-semibold">结算账本</div>
          <div className="mt-1 text-sm text-neutral-400">
            查看每单结算明细与拆分
          </div>
        </Link>
      </div>

      {/* 当前日期标签 */}
      <div className="mb-4 text-sm text-neutral-400">
        当前日期：<span className="font-medium text-neutral-100">{formatDateLabel(date)}</span>
      </div>

      {/* loading / error 提示 */}
      {loading && (
        <div className="mb-4 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm">
          正在加载数据，请稍等…
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          加载失败：{error}
        </div>
      )}

      {/* 简单统计卡片，如果有 summary 字段就用，没有就跳过 */}
      {data?.summary && (
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4">
            <div className="text-xs text-neutral-400 mb-1">总预约单数</div>
            <div className="text-2xl font-semibold">
              {data.summary.total ?? '-'}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4">
            <div className="text-xs text-neutral-400 mb-1">已完成</div>
            <div className="text-2xl font-semibold">
              {data.summary.completed ?? '-'}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4">
            <div className="text-xs text-neutral-400 mb-1">已取消</div>
            <div className="text-2xl font-semibold">
              {data.summary.cancelled ?? data.summary.canceled ?? '-'}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 px-4 py-4">
            <div className="text-xs text-neutral-400 mb-1">预计营业额</div>
            <div className="text-2xl font-semibold">
              {data.summary.amount != null ? `￥${data.summary.amount}` : '-'}
            </div>
          </div>
        </div>
      )}

      {/* 按理发师分组的数据：如果有 barbers 字段就渲染表格 */}
      {Array.isArray(data?.barbers) && data.barbers.length > 0 && (
        <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/80">
          <div className="border-b border-neutral-800 px-4 py-3 text-sm font-medium">
            理发师维度
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900">
                <tr className="text-neutral-400">
                  <th className="px-4 py-2 text-left">理发师</th>
                  <th className="px-4 py-2 text-right">今日单数</th>
                  <th className="px-4 py-2 text-right">已完成</th>
                  <th className="px-4 py-2 text-right">预计营业额</th>
                </tr>
              </thead>
              <tbody>
                {data.barbers.map((b: any) => (
                  <tr
                    key={b.id ?? b.name}
                    className="border-t border-neutral-800 hover:bg-neutral-800/60"
                  >
                    <td className="px-4 py-2">{b.name ?? '-'}</td>
                    <td className="px-4 py-2 text-right">
                      {b.total ?? b.count ?? '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {b.completed ?? b.done ?? '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {b.amount != null ? `￥${b.amount}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 兜底：如果我们不确定数据结构，就把完整 JSON 打印出来 */}
      {data && (
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-3 text-xs text-neutral-300">
          <div className="mb-2 font-medium text-neutral-400">
            原始数据（调试用，看得不爽以后我们再精细美化）：
          </div>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
