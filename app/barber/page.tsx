'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, STATUS_CANCEL, canonStatus } from '@/lib/status'

type Barber = {
  id: number
  name: string
}

type BarberStats = {
  barberId: number
  date: string
  todayCount: number
  todayAmount: number
  weekCount: number
  weekAmount: number
  monthCount: number
  monthAmount: number
  totalCount: number
  totalAmount: number
  recentBookings: Array<{
    id: number
    startTime: string
    status: string
    userName: string
    phone: string
    serviceName: string
    shopName: string
    amount: number
  }>
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function money(n: number) {
  return Number.isFinite(n) ? Math.round(n).toString() : '0'
}

export default function BarberConsolePage() {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [barberId, setBarberId] = useState<number | null>(null)
  const [stats, setStats] = useState<BarberStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const barber = useMemo(() => barbers.find((b) => b.id === barberId), [barbers, barberId])

  useEffect(() => {
    async function fetchBarbers() {
      try {
        const res = await fetch('/api/barbers', { cache: 'no-store' })
        const data = await res.json()
        const list: Barber[] = data?.barbers || []
        setBarbers(list)
        if (list.length && !barberId) setBarberId(list[0].id)
      } catch {
        setMessage('理发师列表加载失败')
      }
    }
    fetchBarbers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function fetchStats() {
      if (!barberId) return
      setLoading(true)
      setMessage('')
      try {
        const res = await fetch(`/api/barbers/stats?barberId=${barberId}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) {
          setMessage(data?.error || '加载失败')
          setStats(null)
          return
        }
        setStats(data as BarberStats)
      } catch (e: any) {
        setMessage(e?.message || '加载失败')
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [barberId])

  return (
    <div className="min-h-screen bg-[#0b0d10] text-neutral-100">
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,_rgba(82,112,255,0.18),_transparent_45%)]" />
        <div className="relative mx-auto max-w-5xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">Barber Console</div>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: '"Space Grotesk", "DIN", sans-serif' }}>
                理发师后台 · 业绩与预约
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                今日节奏、周/月收入、最近预约一页掌握。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={barberId ?? ''}
                onChange={(e) => setBarberId(Number(e.target.value))}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
              >
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Link
                href={barberId ? `/barber/today?barberId=${barberId}` : '/barber/today'}
                className="rounded-full border border-neutral-600 px-4 py-2 text-xs hover:border-neutral-200"
              >
                今日预约
              </Link>
              <Link
                href={barberId ? `/barber/stats?barberId=${barberId}` : '/barber/stats'}
                className="rounded-full bg-neutral-50 text-neutral-900 px-4 py-2 text-xs font-semibold"
              >
                业绩分析
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">今日完成</div>
              <div className="mt-2 text-3xl font-semibold">{stats ? stats.todayCount : '-'}</div>
              <div className="mt-2 text-sm text-neutral-400">¥{stats ? money(stats.todayAmount) : '-'}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">本周完成</div>
              <div className="mt-2 text-3xl font-semibold">{stats ? stats.weekCount : '-'}</div>
              <div className="mt-2 text-sm text-neutral-400">¥{stats ? money(stats.weekAmount) : '-'}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">本月完成</div>
              <div className="mt-2 text-3xl font-semibold">{stats ? stats.monthCount : '-'}</div>
              <div className="mt-2 text-sm text-neutral-400">¥{stats ? money(stats.monthAmount) : '-'}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-medium">累计完成</div>
              <div className="mt-2 flex items-baseline gap-3">
                <div className="text-2xl font-semibold">{stats ? stats.totalCount : '-'}</div>
                <div className="text-sm text-neutral-400">¥{stats ? money(stats.totalAmount) : '-'}</div>
              </div>
              <div className="mt-4 text-xs text-neutral-500">
                统计口径：仅计算已完成订单金额。
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-medium">今日提醒</div>
              <div className="mt-2 text-sm text-neutral-400">
                {barber?.name ? `${barber.name}，保持节奏，按时完成服务。` : '请选择理发师'}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">准时开工</span>
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">服务完成可一键标记</span>
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">收入实时统计</span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div>
                <div className="text-sm font-medium">最近预约</div>
                <div className="text-xs text-neutral-500">最近 10 条预约记录</div>
              </div>
              <div className="text-xs text-neutral-500">{loading ? '加载中…' : stats?.recentBookings?.length ?? 0}</div>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {stats?.recentBookings?.map((b) => {
                const st = canonStatus(b.status)
                const statusText =
                  st === STATUS.COMPLETED
                    ? '已完成'
                    : st === STATUS_CANCEL
                      ? '已取消'
                      : st === STATUS.CONFIRMED
                        ? '已确认'
                        : st === STATUS.SCHEDULED
                          ? '已预约'
                          : String(b.status || '')
                return (
                  <div key={b.id} className="px-4 py-3 border-b border-neutral-800/70">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-semibold">{formatTime(b.startTime)}</div>
                      <span className="text-xs text-neutral-400">{statusText}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                      <div>顾客：{b.userName || '匿名'}</div>
                      <div>项目：{b.serviceName || '-'}</div>
                      <div>门店：{b.shopName || '-'}</div>
                      <div>金额：¥{money(b.amount || 0)}</div>
                    </div>
                  </div>
                )
              })}
              {!loading && (!stats || stats.recentBookings.length === 0) && (
                <div className="px-4 py-8 text-center text-sm text-neutral-500">
                  暂无最近预约
                </div>
              )}
              {message && (
                <div className="px-4 py-3 text-sm text-rose-200">{message}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
