import Link from 'next/link'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

function safeParse(detail: string | null) {
  if (!detail) return null
  try {
    return JSON.parse(detail) as any
  } catch {
    return null
  }
}

function fmtAmount(n: any) {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return '-'
  // 你当前库里金额是 Int（看起来就是“元”级别），先按 ¥168 展示
  // 未来切“分”只要改成：return `￥${(x / 100).toFixed(2)}`
  return `￥${Math.trunc(x)}`
}

function fmtPercentFromBps(bps: any) {
  const x = typeof bps === 'number' ? bps : Number(bps)
  if (!Number.isFinite(x)) return ''
  return `${(x / 100).toFixed(2)}%`
}

export default async function AdminSettlementsPage() {
  const rows = await prisma.ledger.findMany({
    where: { type: 'SETTLE' },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      bookingId: true,
      amount: true,
      status: true,
      detail: true,
      createdAt: true,
      booking: {
        select: {
          startTime: true,
          userName: true,
          phone: true,
          barber: { select: { id: true, name: true } },
          shop: { select: { id: true, name: true } },
        },
      },
    },
  })

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">结算账本</h1>
            <p className="text-sm text-neutral-400 mt-1">
              最近 {rows.length} 条（type=SETTLE）
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link className="underline underline-offset-4 text-neutral-200" href="/admin/dashboard">
              返回概览
            </Link>
            <Link className="underline underline-offset-4 text-neutral-200" href="/admin/settings/shop">
              店铺设置
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-900">
              <tr className="text-neutral-400 border-b border-neutral-800">
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-left">订单</th>
                <th className="px-4 py-3 text-left">店铺</th>
                <th className="px-4 py-3 text-left">理发师</th>
                <th className="px-4 py-3 text-right">总额</th>
                <th className="px-4 py-3 text-right">平台</th>
                <th className="px-4 py-3 text-right">理发师</th>
                <th className="px-4 py-3 text-right">店铺</th>
                <th className="px-4 py-3 text-left">状态</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const d = safeParse(r.detail)
                const amountTotal = d?.amountTotal ?? r.amount
                const platformFeeAmount = d?.platformFeeAmount ?? 0
                const barberFeeAmount = d?.barberFeeAmount ?? 0
                const shopAmount =
                  d?.shopAmount ?? (Number(amountTotal) - Number(platformFeeAmount) - Number(barberFeeAmount))

                return (
                  <tr key={r.id} className="border-b border-neutral-800 hover:bg-neutral-800/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium">#{r.bookingId}</div>
                      <div className="text-xs text-neutral-400">
                        {r.booking?.userName ?? '-'} {r.booking?.phone ? `(${r.booking.phone})` : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.booking?.shop?.name ?? '-'}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.booking?.barber?.name ?? '-'}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {fmtAmount(amountTotal)}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {fmtAmount(platformFeeAmount)}
                      <div className="text-xs text-neutral-400">
                        {d?.platformFeeBps != null ? fmtPercentFromBps(d.platformFeeBps) : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {fmtAmount(barberFeeAmount)}
                      <div className="text-xs text-neutral-400">
                        {d?.barberFeeBps != null ? fmtPercentFromBps(d.barberFeeBps) : ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {fmtAmount(shopAmount)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-200">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                )
              })}

              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={9}>
                    暂无结算记录。先完成一单并调用 /api/bookings/settle 生成账本。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-xs text-neutral-400">
          注：金额目前按数据库的 Int 直接展示；若后续切到“分”，只需改 fmtAmount 的换算即可。
        </div>
      </div>
    </div>
  )
}
