'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, STATUS_CANCEL, canonStatus } from '@/lib/status'

type Shop = {
  id: number
  name: string
  address?: string | null
}

type Barber = {
  id: number
  name: string
  shopId: number
}

type Booking = {
  id: number
  startTime: string
  status: string
  userName: string | null
  phone: string | null
  price?: number | null
  payAmount?: number | null
  barber?: { name: string } | null
  service?: { name: string } | null
}

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export default function ShopOwnerPage() {
  const [shops, setShops] = useState<Shop[]>([])
  const [shopId, setShopId] = useState<number | null>(null)
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [date, setDate] = useState(() => formatDate(new Date()))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const shop = useMemo(() => shops.find((s) => s.id === shopId) || null, [shops, shopId])

  useEffect(() => {
    async function fetchShops() {
      try {
        const res = await fetch('/api/shops', { cache: 'no-store' })
        const data = await res.json()
        const list: Shop[] = Array.isArray(data) ? data : data?.shops || []
        setShops(list)
        if (list.length && !shopId) setShopId(list[0].id)
      } catch {
        setMessage('门店信息加载失败')
      }
    }
    fetchShops()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function fetchBarbers() {
      if (!shopId) return
      try {
        const res = await fetch(`/api/barbers?shopId=${shopId}`, { cache: 'no-store' })
        const data = await res.json()
        const list: Barber[] = data?.barbers || []
        setBarbers(list)
      } catch {
        setBarbers([])
      }
    }
    fetchBarbers()
  }, [shopId])

  useEffect(() => {
    async function fetchBookings() {
      if (!shopId || !date) return
      setLoading(true)
      setMessage('')
      try {
        const res = await fetch(`/api/bookings?shopId=${shopId}&date=${date}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) {
          setBookings([])
          setMessage(data?.message || '预约加载失败')
          return
        }
        setBookings(data?.bookings || [])
      } catch (e: any) {
        setMessage(e?.message || '预约加载失败')
        setBookings([])
      } finally {
        setLoading(false)
      }
    }
    fetchBookings()
  }, [shopId, date])

  const stats = useMemo(() => {
    let totalAmount = 0
    let completedAmount = 0
    let completedCount = 0
    let cancelledCount = 0

    for (const b of bookings) {
      const amount = Number(b.payAmount ?? b.price ?? 0)
      totalAmount += amount
      const st = canonStatus(b.status)
      if (st === STATUS.COMPLETED) {
        completedAmount += amount
        completedCount += 1
      }
      if (st === STATUS_CANCEL) cancelledCount += 1
    }

    return {
      total: bookings.length,
      totalAmount,
      completedAmount,
      completedCount,
      cancelledCount,
    }
  }, [bookings])

  const barberWorkload = useMemo(() => {
    const map = new Map<number, { id: number; name: string; count: number }>()
    for (const b of barbers) {
      map.set(b.id, { id: b.id, name: b.name, count: 0 })
    }
    for (const bk of bookings) {
      const name = bk.barber?.name || '未指定'
      if (bk.barber?.name && bk.barber?.name.length && bk.barber?.name.length > 0) {
        const entry = Array.from(map.values()).find((x) => x.name === name)
        if (entry) entry.count += 1
        else map.set(-1, { id: -1, name, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [barbers, bookings])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_48%)]" />
        <div className="relative max-w-5xl mx-auto px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Shop Owner Console</div>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: '"Bebas Neue", "Oswald", sans-serif' }}>
                店主管理 · 当天运营全景
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                理发师排班、预约节奏、收入趋势一屏掌握。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
              />
              <Link
                href="/admin/bookings"
                className="rounded-full border border-neutral-500 px-4 py-2 text-xs hover:border-neutral-200 transition"
              >
                打开预约管理
              </Link>
              <Link
                href="/admin/settings/shop"
                className="rounded-full bg-neutral-50 text-neutral-900 px-4 py-2 text-xs font-semibold"
              >
                店铺设置
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">当前门店</div>
              <div className="mt-2 text-lg font-semibold">{shop?.name || '加载中…'}</div>
              <div className="mt-1 text-xs text-neutral-500">{shop?.address || '地址待补充'}</div>
              <div className="mt-4">
                <select
                  value={shopId ?? ''}
                  onChange={(e) => setShopId(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">今日预约</div>
              <div className="mt-2 text-3xl font-semibold">{stats.total}</div>
              <div className="mt-2 text-xs text-neutral-500">
                已完成 {stats.completedCount} · 已取消 {stats.cancelledCount}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-xs text-neutral-400">预计营业额</span>
                <span className="text-xl font-semibold">¥{money(stats.totalAmount)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">已完成金额</div>
              <div className="mt-2 text-3xl font-semibold">¥{money(stats.completedAmount)}</div>
              <div className="mt-2 text-xs text-neutral-500">以已完成订单为准</div>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/admin/settlements"
                  className="rounded-full border border-neutral-600 px-3 py-1 text-xs hover:border-neutral-200"
                >
                  结算账本
                </Link>
                <Link
                  href="/admin/dashboard"
                  className="rounded-full border border-neutral-600 px-3 py-1 text-xs hover:border-neutral-200"
                >
                  今日概览
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div>
                  <div className="text-sm font-medium">预约节奏</div>
                  <div className="text-xs text-neutral-500">展示今日全部预约，按时间排序</div>
                </div>
                <div className="text-xs text-neutral-500">{loading ? '加载中…' : `${bookings.length} 单`}</div>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {bookings.map((b) => {
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
                        <div>顾客：{b.userName || '未留名'}</div>
                        <div>理发师：{b.barber?.name || '未指定'}</div>
                        <div>项目：{b.service?.name || '-'}</div>
                        <div>金额：¥{money(Number(b.payAmount ?? b.price ?? 0))}</div>
                      </div>
                    </div>
                  )
                })}
                {!loading && bookings.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-neutral-500">暂无预约</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-medium">理发师负载</div>
              <div className="text-xs text-neutral-500">今日预约分布</div>
              <div className="mt-4 space-y-3">
                {barberWorkload.map((b) => (
                  <div key={`${b.id}-${b.name}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span>{b.name}</span>
                      <span className="text-neutral-400">{b.count} 单</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-neutral-800">
                      <div
                        className="h-2 rounded-full bg-emerald-400"
                        style={{ width: `${Math.min(100, (b.count / Math.max(1, stats.total)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {barberWorkload.length === 0 && (
                  <div className="text-sm text-neutral-500">暂无理发师数据</div>
                )}
              </div>

              <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
                {message || '数据来自实时接口：/api/shops、/api/barbers、/api/bookings'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
