'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { STATUS, normStatus, isCancelled } from '@/lib/status'

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
  return amount.toFixed(0)
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

export default function AdminBookingsPage() {
  const [date, setDate] = useState<string>(() => formatDate(new Date()))
  const [range, setRange] = useState<Range>('day')
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null)

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>('')

  // 状态筛选：全部 / 已预约 / 已完成 / 已取消
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'scheduled' | 'completed' | 'cancelled'
  >('all')

  // 来源筛选：全部 / 小程序 / 网页 / 门店
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'miniapp' | 'web' | 'admin'
  >('all')

  // 手动创建预约表单
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

  // 按状态 + 来源筛选后的预约列表（✅ 兼容大写）
  const filteredBookings = useMemo(() => {
    return bookings.filter((bk) => {
      const st = normStatus(bk.status)

      if (statusFilter !== 'all') {
        if (statusFilter === 'scheduled') {
          // 已预约：SCHEDULED / CONFIRMED 都算
          if (!(st === STATUS.SCHEDULED || st === STATUS.CONFIRMED)) return false
        } else if (statusFilter === 'completed') {
          if (st !== STATUS.COMPLETED) return false
        } else if (statusFilter === 'cancelled') {
          if (!isCancelled(bk.status)) return false
        }
      }

      if (sourceFilter !== 'all') {
        const s = (bk.source || '').toLowerCase()
        if (s !== sourceFilter) return false
      }

      return true
    })
  }, [bookings, statusFilter, sourceFilter])

  // 根据当前列表做一个统计：总预约数 + 营业额
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
      const price =
        typeof bk.price === 'number' ? bk.price : bk.service?.price ?? 0
      const st = normStatus(bk.status)

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
        const res = await fetch('/api/barbers')
        const data = await res.json()
        if (!res.ok) {
          console.error('fetch /api/barbers error:', data)
          return
        }
        setBarbers(data.barbers || data || [])
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

      const res = await fetch(`/api/admin/bookings?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        console.error('fetch /api/admin/bookings error:', data)
        setMessage(data?.error || '获取预约列表失败')
        setBookings([])
        return
      }

      setBookings(data.bookings || [])
    } catch (err: any) {
      console.error('fetch /api/admin/bookings error:', err)
      setMessage(err?.message || '获取预约列表失败')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  // ✅ 允许传大写（我们就传大写）
  async function updateBookingStatus(id: number, status: string) {
    try {
      setLoading(true)
      setMessage('')

      const res = await fetch('/api/admin/bookings/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()

      if (!res.ok) {
        console.error('update-status error:', data)
        setMessage(data?.error || '更新预约状态失败')
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

      const data = await res.json()

      if (!res.ok) {
        console.error('create booking from admin error:', data)
        if (res.status === 409) {
          setMessage(data?.error || '该时间段已被预约，请换一个时间')
        } else {
          setMessage(data?.error || '创建预约失败')
        }
        return
      }

      setNewBooking({ barberId: '', time: '', userName: '', phone: '' })
      await fetchBookings(date, selectedBarberId, range)
      setMessage('预约已创建')
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
      const header = [
        '日期',
        '时间',
        '门店',
        '理发师',
        '项目',
        '顾客',
        '手机号',
        '状态',
        '来源',
      ]

      const rows = filteredBookings.map((bk) => {
        const d = new Date(bk.startTime)
        const dateStr = d.toISOString().slice(0, 10)
        const timeStr = formatTime(bk.startTime)

        const st = normStatus(bk.status)
        const statusLabel =
          st === STATUS.COMPLETED
            ? '已完成'
            : isCancelled(bk.status)
            ? '已取消'
            : st === STATUS.CONFIRMED
            ? '已确认'
            : '已预约'

        const s = (bk.source || '').toLowerCase()
        const sourceLabel =
          s === 'miniapp' ? '小程序' : s === 'web' ? '网页' : s === 'admin' ? '门店' : ''

        return [
          dateStr,
          timeStr,
          bk.shop?.name || '',
          bk.barber?.name || '',
          bk.service?.name || '',
          bk.userName || '',
          bk.phone || '',
          statusLabel,
          sourceLabel,
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
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-neutral-300">按理发师筛选</span>
            <span className="text-xs text-neutral-500">共 {barbers.length} 位理发师</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => setSelectedBarberId(null)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                selectedBarberId === null
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              全部理发师
            </button>
            {barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBarberId(b.id)}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  selectedBarberId === b.id
                    ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                    : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-400">按状态：</span>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-full border transition ${
                statusFilter === 'all'
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              全部
            </button>

            <button
              onClick={() => setStatusFilter('scheduled')}
              className={`px-3 py-1 rounded-full border transition ${
                statusFilter === 'scheduled'
                  ? 'bg-sky-500 text-neutral-900 border-sky-500'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              已预约
            </button>

            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-full border transition ${
                statusFilter === 'completed'
                  ? 'bg-emerald-500 text-neutral-900 border-emerald-500'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              已完成
            </button>

            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-3 py-1 rounded-full border transition ${
                statusFilter === 'cancelled'
                  ? 'bg-neutral-200 text-neutral-900 border-neutral-200'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              已取消
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
            <span className="text-neutral-400">按来源：</span>

            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1 rounded-full border transition ${
                sourceFilter === 'all'
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              全部
            </button>

            <button
              onClick={() => setSourceFilter('miniapp')}
              className={`px-3 py-1 rounded-full border transition ${
                sourceFilter === 'miniapp'
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              小程序
            </button>

            <button
              onClick={() => setSourceFilter('web')}
              className={`px-3 py-1 rounded-full border transition ${
                sourceFilter === 'web'
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              网页
            </button>

            <button
              onClick={() => setSourceFilter('admin')}
              className={`px-3 py-1 rounded-full border transition ${
                sourceFilter === 'admin'
                  ? 'bg-neutral-50 text-neutral-900 border-neutral-50'
                  : 'border-neutral-600 text-neutral-300 hover:border-neutral-300'
              }`}
            >
              门店
            </button>
          </div>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-neutral-300">手动新增预约</span>
              <span className="text-xs text-neutral-500">客人打电话 / 现场 walk-in，可以在这里直接帮他排单</span>
            </div>
            <div className="text-xs text-neutral-500">门店：云买加男士理发 · 玉溪店</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-neutral-300">理发师</span>
              <select
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 outline-none focus:border-neutral-400"
                value={newBooking.barberId}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, barberId: e.target.value }))}
              >
                <option value="">请选择理发师</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-neutral-300">时间段（{date}）</span>
              <select
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 outline-none focus:border-neutral-400"
                value={newBooking.time}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, time: e.target.value }))}
              >
                <option value="">请选择时间</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-neutral-300">顾客姓名</span>
              <input
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 outline-none focus:border-neutral-400"
                placeholder="例如：张三"
                value={newBooking.userName}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, userName: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-neutral-300">手机号</span>
              <input
                className="bg-neutral-950 border border-neutral-700 rounded-md px-2 py-1 outline-none focus:border-neutral-400"
                placeholder="用于联系顾客"
                value={newBooking.phone}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            {message && <span className="text-[11px] text-neutral-400">{message}</span>}
            <button
              onClick={createBookingFromAdmin}
              disabled={loading}
              className="ml-auto px-4 py-1.5 rounded-full text-xs font-medium bg-neutral-50 text-neutral-900 hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              创建预约
            </button>
          </div>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-neutral-300">当前范围预约概览</span>
              <span className="text-xs text-neutral-500">受 日期 + 范围 + 理发师 + 状态 + 来源 筛选影响</span>
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs text-neutral-400">已完成营业额</div>
              <div className="text-lg font-semibold">￥{formatMoney(stats.completedAmount)}</div>
              <div className="text-xs text-neutral-500">预估总额：￥{formatMoney(stats.totalAmount)}（含当前筛选下所有预约）</div>
            </div>
          </div>

          {stats.total === 0 ? (
            <div className="text-xs text-neutral-500">暂无预约数据，在小程序或后台添加一单再回来看看。</div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {stats.byBarber.map((item) => (
                <div
                  key={item.name}
                  className="px-3 py-2 rounded-lg bg-neutral-950/70 border border-neutral-700 text-xs"
                >
                  <div className="text-neutral-300 mb-1">{item.name}</div>
                  <div className="text-xs text-neutral-400 mb-1">预约：{item.count} 单</div>
                  <div className="text-xs">
                    <span>已完 ￥{formatMoney(item.completedAmount)}</span>
                    <span className="ml-1 text-neutral-500">/ 预估 ￥{formatMoney(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between border-b border-neutral-800">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{dateLabel}</span>
              <span className="text-xs text-neutral-500">
                {selectedBarberId
                  ? `当前筛选：${barbers.find((b) => b.id === selectedBarberId)?.name || ''}`
                  : '当前筛选：全部理发师'}
                {' · '}
                {statusFilter === 'all'
                  ? '全部状态'
                  : statusFilter === 'scheduled'
                  ? '仅已预约'
                  : statusFilter === 'completed'
                  ? '仅已完成'
                  : '仅已取消'}
                {' · '}
                {sourceFilter === 'all'
                  ? '全部来源'
                  : sourceFilter === 'miniapp'
                  ? '仅小程序'
                  : sourceFilter === 'web'
                  ? '仅网页'
                  : '仅门店'}
              </span>
            </div>
            {loading && <span className="text-xs text-neutral-400">加载中…</span>}
          </div>

          {message && (
            <div className="px-4 py-2 text-xs text-red-400 border-b border-neutral-800">
              {message}
            </div>
          )}

          {filteredBookings.length === 0 ? (
            <div className="px-4 py-6 text-sm text-neutral-500">
              当前筛选下暂无预约。可以在小程序或上面的表单先创建一笔，再刷新看看。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-neutral-900/80 border-b border-neutral-800">
                  <tr className="text-neutral-400">
                    <th className="px-3 py-2 text-left font-normal">时间</th>
                    <th className="px-3 py-2 text-left font-normal">门店</th>
                    <th className="px-3 py-2 text-left font-normal">理发师</th>
                    <th className="px-3 py-2 text-left font-normal">项目</th>
                    <th className="px-3 py-2 text-left font-normal">顾客</th>
                    <th className="px-3 py-2 text-left font-normal">手机号</th>
                    <th className="px-3 py-2 text-left font-normal">状态</th>
                    <th className="px-3 py-2 text-left font-normal">来源</th>
                    <th className="px-3 py-2 text-left font-normal">操作</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBookings.map((bk) => {
                    const st = normStatus(bk.status)
                    const canOperate = st === STATUS.SCHEDULED || st === STATUS.CONFIRMED

                    return (
                      <tr
                        key={bk.id}
                        className="border-b border-neutral-800/70 hover:bg-neutral-800/40"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">{formatTime(bk.startTime)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{bk.shop?.name || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{bk.barber?.name || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{bk.service?.name || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{bk.userName || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{bk.phone || '-'}</td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          {st === STATUS.COMPLETED ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                              已完成
                            </span>
                          ) : isCancelled(bk.status) ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-700/40 text-neutral-300 border border-neutral-600">
                              已取消
                            </span>
                          ) : st === STATUS.CONFIRMED ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/15 text-sky-300 border border-sky-500/40">
                              已确认
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/15 text-sky-300 border border-sky-500/40">
                              已预约
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          {(() => {
                            const s = (bk.source || '').toLowerCase()
                            return s === 'miniapp'
                              ? '小程序'
                              : s === 'web'
                              ? '网页'
                              : s === 'admin'
                              ? '门店'
                              : '-'
                          })()}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          {canOperate ? (
                            <div className="flex gap-2">
                              <button
                                className="px-2 py-0.5 rounded-full border border-emerald-500/60 text-[10px] text-emerald-300 hover:bg-emerald-500/20 transition"
                                onClick={() => updateBookingStatus(bk.id, STATUS.COMPLETED)}
                              >
                                标记完成
                              </button>
                              <button
                                className="px-2 py-0.5 rounded-full border border-red-500/60 text-[10px] text-red-300 hover:bg-red-500/20 transition"
                                onClick={() => updateBookingStatus(bk.id, STATUS.CANCELLED)}
                              >
                                取消预约
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-neutral-500">无操作</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
