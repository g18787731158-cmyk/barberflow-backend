'use client'

import React, { useEffect, useMemo, useState } from 'react'
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

  // 按状态 + 来源筛选后的预约列表（✅ 全部统一用 canonStatus）
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

  // 根据当前列表做统计：总预约数 + 营业额
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
      const header = ['日期', '时间', '门店', '理发师', '项目', '顾客', '手机号', '状态', '来源']

      const rows = filteredBookings.map((bk) => {
        const d = new Date(bk.startTime)
        const dateStr = d.toISOString().slice(0, 10)
        const timeStr = formatTime(bk.startTime)

        const st = canonStatus(bk.status)
        const statusLabel =
          st === STATUS.COMPLETED
            ? '已完成'
            : st === STATUS.CANCELLED
              ? '已取消'
              : st === STATUS.CONFIRMED
                ? '已确认'
                : st === STATUS.SCHEDULED
                  ? '已预约'
                  : String(bk.status || '')

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
        {/* 其余 UI 你这份本身没问题，我保持不动 */}
        {/* ...（下面这部分你原样保留即可；只要上面逻辑替换就能跑） */}

        {/* 为了不把消息炸得太长，这里省略 UI 不改的部分 */}
        {/* 你直接用你当前文件的 JSX 部分即可，上面逻辑/函数已经修复 */}
      </main>
    </div>
  )
}
