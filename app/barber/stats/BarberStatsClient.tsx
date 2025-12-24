'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { STATUS, normStatus, isCancelled } from '@/lib/status'

type StatPack = {
  todayCount: number
  todayAmount: number
  weekCount: number
  weekAmount: number
  monthCount: number
  monthAmount: number
  totalCount: number
  totalAmount: number
}

type BookingItem = {
  id: number
  startTime: string
  status: string
  userName: string | null
  phone: string | null
  price: number | null
  payAmount: number
  service?: { name: string; price: number } | null
  shop?: { name: string } | null
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function hhmm(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function BarberStatsClient() {
  const sp = useSearchParams()
  const barberId = Number(sp?.get('barberId') || 1)
  const date = sp?.get('date') || todayStr()
  const barberName = sp?.get('barberName') || '理发师'

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<StatPack | null>(null)
  const [bookings, setBookings] = useState<BookingItem[]>([])

  useEffect(() => {
    let alive = true
    async function run() {
      setLoading(true)
      setErr('')
      try {
        const res = await fetch(
          `/api/barbers/stats?barberId=${barberId}&date=${encodeURIComponent(date)}`,
          { cache: 'no-store' }
        )
        const json = await res.json()

        if (!res.ok || json?.success !== true) {
          throw new Error(json?.message || '加载失败')
        }

        if (!alive) return
        setStats(json.stats || null)
        setBookings(Array.isArray(json.bookings) ? json.bookings : [])
      } catch (e: any) {
        if (!alive) return
        setErr(e?.message || '加载失败')
        setStats(null)
        setBookings([])
      } finally {
        if (!alive) return
        setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [barberId, date])

  const recent = useMemo(() => {
    return (bookings || [])
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 10)
      .map((b) => {
        const price =
          typeof b.price === 'number'
            ? b.price
            : typeof b.payAmount === 'number'
            ? b.payAmount
            : typeof b.service?.price === 'number'
            ? b.service.price
            : 0

        const st = normStatus(b.status)
        const statusText =
          st === STATUS.COMPLETED ? '已完成' : isCancelled(b.status) ? '已取消' : st === STATUS.CONFIRMED ? '已确认' : '已预约'

        return {
          id: b.id,
          time: hhmm(b.startTime),
          user: b.userName || '匿名客人',
          service: b.service?.name || '理发',
          shop: b.shop?.name || '',
          statusText,
          price,
        }
      })
  }, [bookings])

  const s = stats || {
    todayCount: 0,
    todayAmount: 0,
    weekCount: 0,
    weekAmount: 0,
    monthCount: 0,
    monthAmount: 0,
    totalCount: 0,
    totalAmount: 0,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: 16 }}>
      <div style={{ padding: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>理发师业绩</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          理发师：{barberName} · 日期：{date} · barberId：{barberId}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {[
          { title: '今日完成', count: s.todayCount, amount: s.todayAmount },
          { title: '本周完成', count: s.weekCount, amount: s.weekAmount },
          { title: '本月完成', count: s.monthCount, amount: s.monthAmount },
          { title: '累计完成', count: s.totalCount, amount: s.totalAmount },
        ].map((item) => (
          <div
            key={item.title}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 14,
              boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b7280' }}>{item.title}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{item.count}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>单</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#111827' }}>¥ {item.amount}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {loading && <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>加载中…</div>}
        {!loading && err && <div style={{ padding: 16, textAlign: 'center', color: '#b91c1c' }}>{err}</div>}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, color: '#4b5563', margin: '10px 0' }}>最近预约（最多 10 条）</div>

        {!loading && !err && recent.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>暂无记录</div>
        )}

        {recent.map((r) => (
          <div
            key={r.id}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 14,
              marginBottom: 10,
              boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
              display: 'flex',
              gap: 12,
            }}
          >
            <div style={{ width: 56, fontWeight: 700, color: '#111827' }}>{r.time}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ color: '#111827' }}>{r.user}</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>{r.statusText}</div>
              </div>
              <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                {r.shop ? `${r.shop} · ` : ''}
                {r.service} · ¥ {r.price}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
