'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Barber = { id: number; name: string }
type BookingItem = {
  id: number
  startTime: string
  status: string
  userName: string
  phone: string | null
  serviceName: string
  shopName: string
  price: number
  payStatus: string
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function BarberTodayPage() {
  const [date, setDate] = useState(todayStr())
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [barberId, setBarberId] = useState<number>(1) // ✅ 老郭默认 1
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [err, setErr] = useState<string>('')
  const [completingId, setCompletingId] = useState<number | null>(null)

  const barberName = useMemo(() => {
    const b = barbers.find((x) => x.id === barberId)
    return b?.name || '理发师'
  }, [barbers, barberId])

  const stats = useMemo(() => {
    let scheduledCount = 0
    let completedCount = 0
    let cancelledCount = 0
    let totalAmount = 0
    let completedAmount = 0

    for (const b of bookings) {
      const price = Number(b.price || 0)
      totalAmount += price
      if (b.status === 'completed') {
        completedCount += 1
        completedAmount += price
      } else if (b.status === 'scheduled') {
        scheduledCount += 1
      } else if (b.status === 'cancelled') {
        cancelledCount += 1
      }
    }

    return {
      total: bookings.length,
      scheduledCount,
      completedCount,
      cancelledCount,
      totalAmount,
      completedAmount,
    }
  }, [bookings])

  async function fetchBarbers() {
    try {
      const res = await fetch('/api/barbers', { cache: 'no-store' })
      const data = await res.json()
      const list: Barber[] = data?.barbers || data || []
      setBarbers(list)

      // 如果列表里有 id=1 就保留，否则默认第一个
      if (list.length && !list.some((b) => b.id === barberId)) {
        setBarberId(list[0].id)
      }
    } catch {
      // 不影响主流程
    }
  }

  async function fetchToday() {
    setLoading(true)
    setErr('')
    try {
      const url = `/api/barber/today?barberId=${barberId}&date=${encodeURIComponent(date)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      const data = await res.json()
      setBookings((data?.bookings || []) as BookingItem[])
    } catch (e: any) {
      setBookings([])
      setErr(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function markComplete(id: number) {
    if (!confirm('确认这单已完成？')) return
    setCompletingId(id)
    try {
      const res = await fetch('/api/bookings/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      await fetchToday()
    } catch (e: any) {
      alert(e?.message || '操作失败')
    } finally {
      setCompletingId(null)
    }
  }

  useEffect(() => {
    fetchBarbers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, date])

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0c', color: '#eaeaea' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>理发师 · 今日预约</div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#9aa0a6' }}>
              理发师：{barberName} · 日期：{date}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link
              href={`/barber/stats?barberId=${barberId}&date=${encodeURIComponent(date)}`}
              style={{ fontSize: 13, color: '#bfc5cc', textDecoration: 'underline' }}
            >
              查看今日业绩
            </Link>
          </div>
        </div>

        {/* 选择区 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#121214', border: '1px solid #1f2226', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 6 }}>理发师</div>
            <select
              value={barberId}
              onChange={(e) => setBarberId(Number(e.target.value))}
              style={{
                background: '#0f1012',
                color: '#eaeaea',
                border: '1px solid #2a2d33',
                borderRadius: 10,
                padding: '8px 10px',
                outline: 'none',
              }}
            >
              {/* 即使没拉到列表，也至少保证 1 可选 */}
              {!barbers.length && <option value={1}>老郭（1）</option>}
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}（{b.id}）
                </option>
              ))}
            </select>
          </div>

          <div style={{ background: '#121214', border: '1px solid #1f2226', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6', marginBottom: 6 }}>日期</div>
            <input
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                background: '#0f1012',
                color: '#eaeaea',
                border: '1px solid #2a2d33',
                borderRadius: 10,
                padding: '8px 10px',
                outline: 'none',
                width: 150,
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 240, background: '#121214', border: '1px solid #1f2226', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#9aa0a6' }}>今日概览</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{stats.total}</div>
              <div style={{ fontSize: 13, color: '#9aa0a6' }}>
                已完成 {stats.completedCount} · 已预约 {stats.scheduledCount} · 已取消 {stats.cancelledCount}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13 }}>
                <span style={{ fontWeight: 800 }}>已完 ¥{stats.completedAmount}</span>
                <span style={{ color: '#9aa0a6' }}> / 预估 ¥{stats.totalAmount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 内容 */}
        <div style={{ marginTop: 18 }}>
          {loading && <div style={{ color: '#9aa0a6', padding: 16 }}>加载中…</div>}
          {!!err && !loading && <div style={{ color: '#ffb4b4', padding: 16 }}>{err}</div>}
          {!loading && !err && bookings.length === 0 && <div style={{ color: '#9aa0a6', padding: 16 }}>今天暂无预约</div>}

          {!loading &&
            bookings.map((b) => {
              const canComplete = b.status === 'scheduled'
              const statusText =
                b.status === 'completed' ? '已完成' : b.status === 'cancelled' ? '已取消' : b.status === 'scheduled' ? '已预约' : b.status

              return (
                <div
                  key={b.id}
                  style={{
                    background: '#0f1012',
                    border: '1px solid #1f2226',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{formatTime(b.startTime)}</div>
                    <div style={{ fontSize: 12, color: '#bfc5cc' }}>{statusText}</div>
                  </div>

                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '92px 1fr', rowGap: 6 }}>
                    <div style={{ color: '#9aa0a6', fontSize: 12 }}>顾客</div>
                    <div style={{ fontSize: 13 }}>
                      {b.userName || '未留姓名'}
                      {b.phone ? `（${b.phone}）` : ''}
                    </div>

                    <div style={{ color: '#9aa0a6', fontSize: 12 }}>项目</div>
                    <div style={{ fontSize: 13 }}>{b.serviceName || '未指定'}</div>

                    <div style={{ color: '#9aa0a6', fontSize: 12 }}>门店</div>
                    <div style={{ fontSize: 13 }}>{b.shopName || ''}</div>

                    <div style={{ color: '#9aa0a6', fontSize: 12 }}>金额</div>
                    <div style={{ fontSize: 13 }}>¥ {Number(b.price || 0)}</div>
                  </div>

                  {canComplete && (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => markComplete(b.id)}
                        disabled={completingId === b.id}
                        style={{
                          background: completingId === b.id ? '#1a1c20' : '#ffffff',
                          color: completingId === b.id ? '#9aa0a6' : '#0b0b0c',
                          border: '1px solid #2a2d33',
                          borderRadius: 999,
                          padding: '8px 12px',
                          cursor: completingId === b.id ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {completingId === b.id ? '提交中…' : '标记完成'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
