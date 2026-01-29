'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, STATUS_CANCEL, canonStatus } from '@/lib/status'

type Booking = {
  id: number
  startTime: string
  status: string
  userName: string | null
  phone: string | null
  shop?: { name: string } | null
  barber?: { name: string } | null
  service?: { name: string; price?: number | null } | null
  price?: number | null
  payAmount?: number | null
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

export default function CustomerPortalPage() {
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState(() => formatDate(new Date()))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const searchDisabled = useMemo(() => !phone.trim(), [phone])

  useEffect(() => {
    setBookings([])
  }, [phone])

  async function handleSearch() {
    if (!phone.trim()) {
      setMessage('请输入手机号')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(`/api/bookings?phone=${encodeURIComponent(phone.trim())}&date=${date}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data?.message || '查询失败')
        setBookings([])
        return
      }
      setBookings(data?.bookings || [])
      if (!data?.bookings?.length) setMessage('该手机号暂无预约记录')
    } catch (e: any) {
      setMessage(e?.message || '查询失败')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#06070a] text-neutral-50">
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(236,180,99,0.2),_transparent_45%)]" />
        <div className="relative mx-auto max-w-4xl px-5 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">Customer Portal</div>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: '"Playfair Display", "Noto Serif SC", serif' }}>
                客户中心 · 预约管理
              </h1>
              <p className="mt-2 text-sm text-neutral-400">查预约、改时间、再次预约，一站式处理。</p>
            </div>
            <Link
              href="/booking"
              className="rounded-full bg-neutral-50 text-neutral-900 px-5 py-2 text-xs font-semibold"
            >
              新建预约
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
              <div className="text-sm font-medium">预约查询</div>
              <div className="mt-4 grid gap-3">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="输入手机号（必填）"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSearch}
                  disabled={searchDisabled || loading}
                  className="rounded-full border border-neutral-500 px-4 py-2 text-xs hover:border-neutral-200 disabled:opacity-50"
                >
                  {loading ? '查询中…' : '查询我的预约'}
                </button>
                {message && <div className="text-xs text-amber-200">{message}</div>}
              </div>

              <div className="mt-6 text-xs text-neutral-500">
                支持按手机号查询当天预约。如需查看更多日期，可切换日期后再次查询。
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
              <div className="text-sm font-medium">贴心提醒</div>
              <div className="mt-3 space-y-2 text-sm text-neutral-400">
                <p>请提前 10 分钟到店，以免错过排队时间。</p>
                <p>若临时有事，可以直接电话联系门店调整。</p>
                <p>完成后可在这里查看本次消费记录。</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">手机号直达</span>
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">自助查询</span>
                <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs">支持复约</span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div>
                <div className="text-sm font-medium">预约列表</div>
                <div className="text-xs text-neutral-500">显示查询到的预约记录</div>
              </div>
              <div className="text-xs text-neutral-500">{bookings.length} 条</div>
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
              {!loading && bookings.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-neutral-500">暂无预约记录</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
