import React, { Suspense } from 'react'
import BarberStatsClient from './BarberStatsClient'

export default function BarberStatsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#9ca3af' }}>加载中…</div>}>
      <BarberStatsClient />
    </Suspense>
  )
}
