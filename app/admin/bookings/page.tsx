'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { STATUS, canonStatus } from '@/lib/status'

type Barber = {
  id: number
  name: string
}

type Booking = {
  id: number
  userName: string | null
  phone: string | null
  startTime: string
  status: string
  price?: number | null
  source?: string | null
  shop?: { name: string } | null
  barber?: { name: string } | null
  service?: { name: string; price: number | null } | null
}

type Range = 'day' | 'week' | 'month'

function formatDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatMoney(amount: number) {
  return Number.isFinite(amount) ? amount.toFixed(0) : '0'
}

function statusLabel(raw: string) {
  const st = canonStatus(raw)
  if (st === STATUS.COMPLETED) return '已完成'
  if (st === STATUS.CANCELLED) return '已取消'
  if (st === STATUS.CONFIRMED) return '已确认'
  if (st === STATUS.SCHEDULED) return '已预约'
  return String(raw || '')
}

function sourceLabel(raw?: string | null) {
  const s = (raw || '').toLowerCase()
  if (s === 'miniapp') return '小程序'
  if (s === 'web') return '网页'
  if (s === 'admin') return '门店'
  return s || '-'
}

function computePrice(bk: Booking) {
  const p = typeof bk.price === 'number' ? bk.price : bk.service?.price ?? 0
  return Number.isFinite(p) ? p : 0
}

// 生成 10:00 ~ 21:00 的半小时时段
function generateTimeSlots() {
  const slots: string[] = []
  for (let h = 10; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m === 30) continue
      const hh = h.toString().padStart(2, '0')
      const mm = m.toString().padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
  }
  return slots
}

const TIME_OPTIONS = generateTimeSlots()

async function safeJson(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

function pickErr(data: any) {
  return data?.error || data?.message || data?.msg || (typeof data?.raw === 'string' ? data.raw : '')
}

export default function AdminBookingsPage() {
  const [date, setDate] = useState<string>(() => formatDate(new Date()))
  const [range, setRange] = useState<Range>('day')
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null)

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')

  // 仅锁定某一行按钮的 loading
  const [actioning, setActioning] = useState<{
    id: number
    kind: 'complete' | 'settle' | 'complete_settle' | 'cancel'
  } | null>(null)

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'scheduled' | 'completed' | 'cancelled'
  >('all')

  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'miniapp' | 'web' | 'admin'
  >('all')

  const [newBooking, setNewBooking] = useState<{
    barberId: string
    time: string
    userName: string
    phone: string
  }>({
    barberId: '',
    time: '',
    userName: '',
    phone: '',
  })

  const filteredBookings = useMemo(() => {
    return bookings.filter((bk) => {
      const st = canonStatus(bk.status)

      if (statusFilter !== 'all') {
        if (statusFilter === 'scheduled') {
          if (!(st === STATUS.SCHEDULED || st === STATUS.CONFIRMED)) return false
        } else if (statusFilter === 'completed') {
          if (st !== STATUS.COMPLETED) return false
        } else if (statusFilter === 'cancelled') {
          if (st !== STATUS.CANCELLED) return false
        }
      }

      if (sourceFilter !== 'all') {
        const s = (bk.source || '').toLowerCase()
        if (s !== sourceFilter) return false
      }

      return true
    })
  }, [bookings, statusFilter, sourceFilter])

  const stats = useMemo(() => {
    const result = {
      total: filteredBookings.length,
      totalAmount: 0,
      completedAmount: 0,
      byBarber: [] as {
        name: string
        count: number
        amount: number
        completedAmount: number
      }[],
    }

    if (!filteredBookings.length) return result

    const map = new Map<
      string,
      { count: number; amount: number; completedAmount: number }
    >()

    for (const bk of filteredBookings) {
      const name = bk.barber?.name || '未指定理发师'
      const price = computePrice(bk)
      const st = canonStatus(bk.status)

      let item = map.get(name)
      if (!item) {
        item = { count: 0, amount: 0, completedAmount: 0 }
        map.set(name, item)
      }

      item.count += 1
      item.amount += price
      result.totalAmount += price

      if (st === STATUS.COMPLETED) {
        item.completedAmount += price
        result.completedAmount += price
      }
    }

    result.byBarber = Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        count: v.count,
        amount: v.amount,
        completedAmount: v.completedAmount,
      }))
      .sort((a, b) => b.count - a.count)

    return result
  }, [filteredBookings])

  const dateLabel = useMemo(() => {
    const todayStr = formatDate(new Date())
    if (range === 'day') {
      if (date === todayStr) return '今日预约'
      return `${date} 的预约`
    }
    if (range === 'week') return `${date} 所在周的预约`
    if (range === 'month') return `${date.slice(0, 7)} 整月的预约`
    return '当前时间范围的预约'
  }, [date, range])

  useEffect(() => {
    async function fetchBarbers() {
      try {
        const res = await fetch('/api/barbers', { cache: 'no-store' })
        const data = await safeJson(res)
        if (!res.ok) {
          console.error('fetch /api/barbers error:', data)
          return
        }
        setBarbers((data as any).barbers || (data as any) || [])
      } catch (err) {
        console.error('fetch /api/barbers error:', err)
      }
    }
    fetchBarbers()
  }, [])

  async function fetchBookings(
    currentDate: string,
    barberId: number | null,
    currentRange: Range = range,
  ) {
    try {
      setLoading(true)
      setMessage('')

      const params = new URLSearchParams()
      if (currentDate) params.set('date', currentDate)
      params.set('range', currentRange)
      if (barberId) params.set('barberId', String(barberId))

      const res = await fetch(`/api/admin/bookings?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await safeJson(res)

      if (!res.ok) {
        console.error('fetch /api/admin/bookings error:', data)
        setMessage(pickErr(data) || '获取预约列表失败')
        setBookings([])
        return
      }

      setBookings((data as any).bookings || [])
    } catch (err: any) {
      console.error('fetch /api/admin/bookings error:', err)
      setMessage(err?.message || '获取预约列表失败')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  async function updateBookingStatus(id: number, status: string) {
    try {
      setLoading(true)
      setMessage('')

      const res = await fetch('/api/admin/bookings/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await safeJson(res)

      if (!res.ok) {
        console.error('update-status error:', data)
        setMessage(pickErr(data) || '更新预约状态失败')
        return
      }

      await fetchBookings(date, selectedBarberId, range)
    } catch (err: any) {
      console.error('update-status error:', err)
      setMessage(err?.message || '更新预约状态失败')
    } finally {
      setLoading(false)
    }
  }

  async function createBookingFromAdmin() {
    try {
      const { barberId, time, userName, phone } = newBooking

      if (!barberId) return setMessage('请选择理发师')
      if (!time) return setMessage('请选择时间段')
      if (!userName.trim()) return setMessage('请输入顾客姓名')
      if (!phone.trim()) return setMessage('请输入顾客手机号')

      setLoading(true)
      setMessage('')

      const startTime = `${date} ${time}:00`

      const payload = {
        userName,
        phone,
        shopId: 1,
        barberId: Number(barberId),
        serviceId: 1,
        startTime,
        source: 'admin',
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await safeJson(res)

      if (!res.ok) {
        console.error('create booking from admin error:', data)
        if (res.status === 409) {
          setMessage(pickErr(data) || '该时间段已被预约，请换一个时间')
        } else {
          setMessage(pickErr(data) || '创建预约失败')
        }
        return
      }

      setNewBooking({ barberId: '', time: '', userName: '', phone: '' })
      await fetchBookings(date, selectedBarberId, range)
      setMessage('✅ 预约已创建')
    } catch (err: any) {
      console.error('create booking from admin error:', err)
      setMessage(err?.message || '创建预约失败')
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    if (!filteredBookings.length) {
      setMessage('当前没有可导出的预约')
      return
    }

    try {
      const header = ['日期', '时间', '门店', '理发师', '项目', '顾客', '手机号', '状态', '来源']

      const rows = filteredBookings.map((bk) => {
        const d = new Date(bk.startTime)
        const dateStr = d.toISOString().slice(0, 10)
        const timeStr = formatTime(bk.startTime)

        const statusText = statusLabel(bk.status)
        const sourceText = sourceLabel(bk.source)

        return [
          dateStr,
          timeStr,
          bk.shop?.name || '',
          bk.barber?.name || '',
          bk.service?.name || '',
          bk.userName || '',
          bk.phone || '',
          statusText,
          sourceText,
        ]
      })

      const allRows = [header, ...rows]
      const csvContent = allRows
        .map((row) =>
          row
            .map((field) => {
              const v = (field ?? '').toString().replace(/"/g, '""')
              return `"${v}"`
            })
            .join(','),
        )
        .join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const statusPart =
        statusFilter === 'all'
          ? 'all'
          : statusFilter === 'scheduled'
            ? 'scheduled'
            : statusFilter === 'completed'
              ? 'completed'
              : 'cancelled'

      const barberPart =
        selectedBarberId === null ? 'all-barbers' : `barber-${selectedBarberId}`

      const rangePart = range
      const sourcePart = sourceFilter === 'all' ? 'all-sources' : sourceFilter

      a.download = `barberflow-${rangePart}-${date}-${barberPart}-${statusPart}-${sourcePart}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error('export csv error:', e)
      setMessage('导出失败，请稍后再试')
    }
  }

  // ✅ 业务 API：关键修复点在这里 —— 统一传 { id }，并兼容 bookingId
  async function apiComplete(bookingId: number) {
    const res = await fetch('/api/bookings/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId, bookingId }),
    })
    const data = await safeJson(res)
    if (!res.ok) throw new Error(pickErr(data) || `完成失败：${res.status}`)
    return data
  }

  async function apiCancel(bookingId: number) {
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId, bookingId }),
    })
    const data = await safeJson(res)
    if (!res.ok) throw new Error(pickErr(data) || `取消失败：${res.status}`)
    return data
  }

  async function apiSettle(bookingId: number) {
    const res = await fetch('/api/bookings/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId, bookingId }),
    })
    const data = await safeJson(res)
    if (!res.ok) throw new Error(pickErr(data) || `结算失败：${res.status}`)
    return data
  }

  async function handleComplete(bookingId: number) {
    try {
      setActioning({ id: bookingId, kind: 'complete' })
      setMessage('')
      await apiComplete(bookingId)
      await fetchBookings(date, selectedBarberId, range)
      setMessage(`✅ #${bookingId} 已完成`)
    } catch (e: any) {
      setMessage(e?.message || '完成失败')
    } finally {
      setActioning(null)
    }
  }

  async function handleCancel(bookingId: number) {
    try {
      setActioning({ id: bookingId, kind: 'cancel' })
      setMessage('')
      await apiCancel(bookingId)
      await fetchBookings(date, selectedBarberId, range)
      setMessage(`✅ #${bookingId} 已取消`)
    } catch (e: any) {
      setMessage(e?.message || '取消失败')
    } finally {
      setActioning(null)
    }
  }

  async function handleSettle(bookingId: number) {
    try {
      setActioning({ id: bookingId, kind: 'settle' })
      setMessage('')
      const data: any = await apiSettle(bookingId)
      await fetchBookings(date, selectedBarberId, range)
      if (data?.settled) {
        setMessage(`✅ #${bookingId} 已结算`)
      } else {
        setMessage(`⚠️ #${bookingId} 结算返回：${JSON.stringify(data)}`)
      }
    } catch (e: any) {
      setMessage(e?.message || '结算失败')
    } finally {
      setActioning(null)
    }
  }

  async function handleCompleteAndSettle(bookingId: number) {
    try {
      setActioning({ id: bookingId, kind: 'complete_settle' })
      setMessage('')

      await apiComplete(bookingId)
      const data: any = await apiSettle(bookingId)

      await fetchBookings(date, selectedBarberId, range)
      setMessage(
        data?.settled
          ? `✅ #${bookingId} 已完成并结算`
          : `⚠️ #${bookingId} 已完成，但结算返回异常：${JSON.stringify(data)}`,
      )
    } catch (e: any) {
      setMessage(e?.message || '完成并结算失败')
    } finally {
      setActioning(null)
    }
  }

  useEffect(() => {
    fetchBookings(date, selectedBarberId, range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedBarberId, range])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <header className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">BarberFlow · 预约管理</h1>
          <p className="text-xs text-neutral-400">
            一眼看到每天 / 本周 / 本月：哪个理发师忙、做了多少钱、线上线下各贡献多少
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="text-xs px-3 py-1 rounded-full border border-neutral-700 hover:border-neutral-300 transition"
          >
            返回概览
          </Link>
          <Link
            href="/admin/settlements"
            className="text-xs px-3 py-1 rounded-full border border-neutral-700 hover:border-neutral-300 transition"
          >
            结算账本
          </Link>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400 whitespace-nowrap">基准日期</span>
            <input
              type="date"
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm outline-none focus:border-neutral-400"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 text-xs border border-neutral-700 rounded-full px-1 py-0.5 bg-neutral-900">
            <button
              onClick={() => setRange('day')}
              className={`px-2 py-0.5 rounded-full ${
                range === 'day' ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-300'
              }`}
            >
              天
            </button>
            <button
              onClick={() => setRange('week')}
              className={`px-2 py-0.5 rounded-full ${
                range === 'week' ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-300'
              }`}
            >
              周
            </button>
            <button
              onClick={() => setRange('month')}
              className={`px-2 py-0.5 rounded-full ${
                range === 'month' ? 'bg-neutral-50 text-neutral-900' : 'text-neutral-300'
              }`}
            >
              月
            </button>
          </div>

          <button
            onClick={exportCsv}
            className="text-xs px-3 py-1 rounded-full border border-neutral-600 hover:border-neutral-300 transition"
          >
            导出 CSV
          </button>

          <button
            onClick={() => fetchBookings(date, selectedBarberId, range)}
            className="text-xs px-3 py-1 rounded-full border border-neutral-600 hover:border-neutral-300 transition"
          >
            手动刷新
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {message && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-200">
            {message}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="text-xs text-neutral-400 mb-1">{dateLabel}</div>
            <div className="text-2xl font-semibold">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="text-xs text-neutral-400 mb-1">预计营业额（筛选后）</div>
            <div className="text-2xl font-semibold">￥{formatMoney(stats.totalAmount)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="text-xs text-neutral-400 mb-1">已完成金额（筛选后）</div>
            <div className="text-2xl font-semibold">￥{formatMoney(stats.completedAmount)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="text-xs text-neutral-400 mb-1">理发师统计条目</div>
            <div className="text-2xl font-semibold">{stats.byBarber.length}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-400">理发师</span>
              <select
                value={selectedBarberId ?? ''}
                onChange={(e) =>
                  setSelectedBarberId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 text-sm"
              >
                <option value="">全部</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-400">状态</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 text-sm"
              >
                <option value="all">全部</option>
                <option value="scheduled">已预约/已确认</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-400">来源</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 text-sm"
              >
                <option value="all">全部</option>
                <option value="miniapp">小程序</option>
                <option value="web">网页</option>
                <option value="admin">门店</option>
              </select>
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-3">
            <div className="text-sm font-medium mb-2">门店手动加单</div>
            <div className="grid gap-2 md:grid-cols-5">
              <select
                value={newBooking.barberId}
                onChange={(e) => setNewBooking((p) => ({ ...p, barberId: e.target.value }))}
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-2 text-sm"
              >
                <option value="">选择理发师</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                value={newBooking.time}
                onChange={(e) => setNewBooking((p) => ({ ...p, time: e.target.value }))}
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-2 text-sm"
              >
                <option value="">选择时间</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <input
                value={newBooking.userName}
                onChange={(e) => setNewBooking((p) => ({ ...p, userName: e.target.value }))}
                placeholder="顾客姓名"
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-2 text-sm"
              />
              <input
                value={newBooking.phone}
                onChange={(e) => setNewBooking((p) => ({ ...p, phone: e.target.value }))}
                placeholder="手机号"
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-2 text-sm"
              />

              <button
                onClick={createBookingFromAdmin}
                disabled={loading}
                className="rounded-md border border-neutral-600 hover:border-neutral-300 transition px-3 py-2 text-sm disabled:opacity-50"
              >
                创建预约
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div className="text-sm font-medium">预约列表（筛选后 {filteredBookings.length} 条）</div>
            <div className="text-xs text-neutral-400">
              小技巧：先“完成并结算”，再去「结算账本」核对拆分
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-900">
                <tr className="text-neutral-400">
                  <th className="px-4 py-2 text-left">时间</th>
                  <th className="px-4 py-2 text-left">理发师</th>
                  <th className="px-4 py-2 text-left">顾客</th>
                  <th className="px-4 py-2 text-left">项目</th>
                  <th className="px-4 py-2 text-right">金额</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">来源</th>
                  <th className="px-4 py-2 text-right">操作</th>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map((bk) => {
                  const st = canonStatus(bk.status)
                  const price = computePrice(bk)

                  const isRowBusy = actioning?.id === bk.id
                  const busyKind = isRowBusy ? actioning?.kind : null

                  const canComplete = st === STATUS.SCHEDULED || st === STATUS.CONFIRMED
                  const canCancel = st === STATUS.SCHEDULED || st === STATUS.CONFIRMED
                  const canSettle = st === STATUS.COMPLETED

                  return (
                    <tr
                      key={bk.id}
                      className="border-t border-neutral-800 hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-neutral-100">{formatTime(bk.startTime)}</div>
                        <div className="text-xs text-neutral-500">
                          {new Date(bk.startTime).toISOString().slice(0, 10)}
                        </div>
                      </td>
                      <td className="px-4 py-2">{bk.barber?.name || '-'}</td>
                      <td className="px-4 py-2">
                        <div>{bk.userName || '-'}</div>
                        <div className="text-xs text-neutral-500">{bk.phone || ''}</div>
                      </td>
                      <td className="px-4 py-2">{bk.service?.name || '-'}</td>
                      <td className="px-4 py-2 text-right">￥{formatMoney(price)}</td>
                      <td className="px-4 py-2">{statusLabel(bk.status)}</td>
                      <td className="px-4 py-2">{sourceLabel(bk.source)}</td>

                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canComplete && (
                            <>
                              <button
                                disabled={isRowBusy}
                                onClick={() => handleComplete(bk.id)}
                                className="text-xs px-2.5 py-1 rounded-md border border-neutral-700 hover:border-neutral-300 disabled:opacity-50"
                              >
                                {busyKind === 'complete' ? '完成中…' : '完成'}
                              </button>

                              <button
                                disabled={isRowBusy}
                                onClick={() => handleCompleteAndSettle(bk.id)}
                                className="text-xs px-2.5 py-1 rounded-md border border-neutral-50 bg-neutral-50 text-neutral-950 hover:opacity-90 disabled:opacity-50"
                              >
                                {busyKind === 'complete_settle' ? '结算中…' : '完成并结算'}
                              </button>
                            </>
                          )}

                          {canSettle && (
                            <button
                              disabled={isRowBusy}
                              onClick={() => handleSettle(bk.id)}
                              className="text-xs px-2.5 py-1 rounded-md border border-neutral-700 hover:border-neutral-300 disabled:opacity-50"
                            >
                              {busyKind === 'settle' ? '结算中…' : '结算'}
                            </button>
                          )}

                          {canCancel && (
                            <button
                              disabled={isRowBusy}
                              onClick={() => handleCancel(bk.id)}
                              className="text-xs px-2.5 py-1 rounded-md border border-red-500/60 text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              {busyKind === 'cancel' ? '取消中…' : '取消'}
                              </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredBookings.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-neutral-500"
                    >
                      {loading ? '加载中…' : '暂无预约（换个筛选条件看看）'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-neutral-800 text-xs text-neutral-500">
            备注：结算逻辑会读取「店铺设置」里的平台费率/理发师提成（basis = bps/10000），账本可在「结算账本」查看。
          </div>
        </div>
      </main>
    </div>
  )
}
