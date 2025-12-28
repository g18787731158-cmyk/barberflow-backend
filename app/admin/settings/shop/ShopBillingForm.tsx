'use client'

import { useMemo, useState } from 'react'

function bpsToPercent(bps: number) {
  return Number((bps / 100).toFixed(2))
}
function percentToBps(percent: number) {
  // 2% -> 200
  return Math.round(percent * 100)
}

export default function ShopBillingForm(props: {
  shopId: number
  platformShareBasis: number
  barberShareBasis: number
}) {
  const [platformPercent, setPlatformPercent] = useState(() => bpsToPercent(props.platformShareBasis))
  const [barberPercent, setBarberPercent] = useState(() => bpsToPercent(props.barberShareBasis))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const preview = useMemo(() => {
    const pBps = percentToBps(platformPercent)
    const bBps = percentToBps(barberPercent)
    return { pBps, bBps }
  }, [platformPercent, barberPercent])

  async function onSave() {
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/shops/update-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: props.shopId,
          platformShareBasis: preview.pBps,
          barberShareBasis: preview.bBps,
        }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        setMsg(`保存失败：${data?.error ?? res.statusText}`)
        return
      }
      setMsg(`已保存：平台 ${platformPercent}% / 理发师 ${barberPercent}%`)
    } catch (e: any) {
      setMsg(`保存异常：${e?.message ?? String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">平台费率（%）</label>
          <input
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-black"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={platformPercent}
            onChange={(e) => setPlatformPercent(Number(e.target.value))}
          />
          <div className="mt-1 text-xs text-gray-500">保存为 bps：{preview.pBps}</div>
        </div>

        <div>
          <label className="text-sm font-medium">理发师提成（%）</label>
          <input
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-black"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={barberPercent}
            onChange={(e) => setBarberPercent(Number(e.target.value))}
          />
          <div className="mt-1 text-xs text-gray-500">保存为 bps：{preview.bBps}</div>
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {saving ? '保存中…' : '保存'}
      </button>

      {msg ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
          {msg}
        </div>
      ) : null}
    </div>
  )
}
