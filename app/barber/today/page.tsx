'use client'

import { useEffect, useState } from 'react'

type Item = {
  id: number
  startTime: string
  status: string
  userName: string | null
  phone: string | null
  serviceName: string
  shopName: string
  price: number
}

function hhmm(dateStr: string) {
  const d = new Date(dateStr)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function BarberTodayWeb() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Item[]>([])
  const [kpi, setKpi] = useState({ count: 0, revenue: 0 })

  const barberId = 1

  useEffect(() => {
    const date = todayStr()
    fetch(`/api/barber/today?barberId=${barberId}&date=${encodeURIComponent(date)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return await r.json()
      })
      .then((res) => {
        const list: Item[] = res?.bookings || []
        setRows(list)
        const revenue = list.reduce((sum, b) => sum + (Number(b.price) || 0), 0)
        setKpi({ count: list.length, revenue })
        setLoading(false)
      })
      .catch((e) => {
        setError(String(e?.message || e))
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: 16 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>理发师 · 今日预约</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            barberId: {barberId} · {todayStr()}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#666' }}>单数</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{kpi.count}</div>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#666' }}>金额</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>¥{kpi.revenue}</div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: 12 }}>
          {loading && <div style={{ color: '#666' }}>加载中…</div>}
          {error && <div style={{ color: '#b91c1c' }}>加载失败：{error}</div>}

          {!loading && !error && rows.length === 0 && (
            <div style={{ color: '#666' }}>今天暂无预约</div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((b) => (
                <div
                  key={b.id}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {hhmm(b.startTime)} · {b.serviceName || '理发'}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                      客户：{b.userName || '匿名'} {b.phone || ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                      门店：{b.shopName || '-'} · ¥{b.price}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#333' }}>{b.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
