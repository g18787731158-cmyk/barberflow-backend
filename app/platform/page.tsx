'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, STATUS_CANCEL, canonStatus } from '@/lib/status'

type Shop = { id: number; name: string }

type Barber = { id: number; name: string }

type Service = { id: number; name: string; price: number }

type Booking = {
  id: number
  startTime: string
  status: string
  shop?: { name: string } | null
  barber?: { name: string } | null
  service?: { name: string; price?: number | null } | null
  price?: number | null
  payAmount?: number | null
}

type Transaction = {
  id?: string | number
  amount: number
  source?: string
  createdAt?: string
  remark?: string
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

export default function PlatformAdminPage() {
  const [shops, setShops] = useState<Shop[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [date, setDate] = useState(() => formatDate(new Date()))
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function fetchBase() {
      try {
        const [shopRes, barberRes, serviceRes] = await Promise.all([
          fetch('/api/shops', { cache: 'no-store' }),
          fetch('/api/barbers', { cache: 'no-store' }),
          fetch('/api/services', { cache: 'no-store' }),
        ])

        const shopData = await shopRes.json().catch(() => [])
        const barberData = await barberRes.json().catch(() => ({}))
        const serviceData = await serviceRes.json().catch(() => ({}))

        setShops(Array.isArray(shopData) ? shopData : shopData?.shops || [])
        setBarbers(barberData?.barbers || [])
        setServices(serviceData?.services || [])
      } catch {
        setMessage('基础数据加载失败')
      }
    }
    fetchBase()
  }, [])

  useEffect(() => {
    async function fetchBookings() {
      try {
        const res = await fetch(`/api/bookings?date=${date}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) {
          setBookings([])
          setMessage(data?.message || '预约加载失败')
          return
        }
        setBookings(data?.bookings || [])
      } catch {
        setBookings([])
      }
    }
    fetchBookings()
  }, [date])

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const res = await fetch('/api/transactions', { cache: 'no-store' })
        const data = await res.json()
        setTransactions(data?.list || [])
      } catch {
        setTransactions([])
      }
    }
    fetchTransactions()
  }, [])

  const bookingStats = useMemo(() => {
    let totalAmount = 0
    let completedAmount = 0
    let completedCount = 0
    let cancelledCount = 0

    for (const b of bookings) {
      const amount = Number(b.payAmount ?? b.price ?? b.service?.price ?? 0)
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

  const transactionSum = useMemo(() => transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0), [transactions])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,_rgba(32,147,199,0.22),_transparent_48%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-neutral-400">Platform Command</div>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: '"Anton", "Oswald", sans-serif' }}>
                平台运营中心 · 全站掌控
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                用户、预约、收入、支付全链路一屏查看。
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
                href="/admin/dashboard"
                className="rounded-full border border-neutral-600 px-4 py-2 text-xs hover:border-neutral-200"
              >
                门店后台
              </Link>
              <Link
                href="/admin/bookings"
                className="rounded-full bg-neutral-50 text-neutral-900 px-4 py-2 text-xs font-semibold"
              >
                预约管理
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">门店数</div>
              <div className="mt-2 text-3xl font-semibold">{shops.length}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">理发师</div>
              <div className="mt-2 text-3xl font-semibold">{barbers.length}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">服务项目</div>
              <div className="mt-2 text-3xl font-semibold">{services.length}</div>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="text-xs text-neutral-400">今日预约</div>
              <div className="mt-2 text-3xl font-semibold">{bookingStats.total}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div>
                  <div className="text-sm font-medium">全站预约动态</div>
                  <div className="text-xs text-neutral-500">当前日期所有门店预约</div>
                </div>
                <div className="text-xs text-neutral-500">{bookingStats.total} 单</div>
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
                        <div>门店：{b.shop?.name || '-'}</div>
                        <div>理发师：{b.barber?.name || '-'}</div>
                        <div>项目：{b.service?.name || '-'}</div>
                        <div>金额：¥{money(Number(b.payAmount ?? b.price ?? b.service?.price ?? 0))}</div>
                      </div>
                    </div>
                  )
                })}
                {bookings.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-neutral-500">暂无预约</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
              <div className="text-sm font-medium">收入监控</div>
              <div className="mt-3 text-xs text-neutral-500">来自订单与支付流水的综合展示</div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="text-xs text-neutral-400">今日预计营业额</div>
                  <div className="mt-2 text-2xl font-semibold">¥{money(bookingStats.totalAmount)}</div>
                  <div className="mt-1 text-xs text-neutral-500">已完成 ¥{money(bookingStats.completedAmount)}</div>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="text-xs text-neutral-400">支付流水累计</div>
                  <div className="mt-2 text-2xl font-semibold">¥{money(transactionSum)}</div>
                  <div className="mt-1 text-xs text-neutral-500">{transactions.length} 条记录</div>
                </div>
              </div>

              <div className="mt-6 text-xs text-neutral-500">{message || '数据来自 /api/shops /api/barbers /api/services /api/bookings /api/transactions'}</div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">最近支付流水</div>
                <div className="text-xs text-neutral-500">用于监控付款与异常情况</div>
              </div>
              <Link
                href="/admin/settlements"
                className="text-xs border border-neutral-600 px-3 py-1 rounded-full hover:border-neutral-200"
              >
                查看结算
              </Link>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {transactions.map((t, idx) => (
                <div key={t.id ?? idx} className="px-4 py-3 border-b border-neutral-800/70">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">¥{money(t.amount)}</div>
                    <div className="text-xs text-neutral-500">{t.source || 'pay'}</div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString('zh-CN') : '未记录时间'}
                  </div>
                  {t.remark && <div className="mt-1 text-xs text-neutral-400">{t.remark}</div>}
                </div>
              ))}
              {transactions.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-neutral-500">暂无流水记录</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
