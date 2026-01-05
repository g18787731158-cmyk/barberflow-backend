export const STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  // 统一用 CANCELED（你数据库/接口也在用这个）
  CANCELLED: 'CANCELED',
} as const

// ✅ 给 status/route.ts 用的类型（之前缺的就是它）
export type CanonStatus = (typeof STATUS)[keyof typeof STATUS] | string

export function canonStatus(raw: unknown): CanonStatus {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''

  if (s === 'CANCELLED') return 'CANCELED'
  if (s === 'CANCELED') return 'CANCELED'
  if (s === 'SCHEDULED') return 'SCHEDULED'
  if (s === 'CONFIRMED') return 'CONFIRMED'
  if (s === 'COMPLETED') return 'COMPLETED'

  return s
}
