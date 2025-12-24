export const STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const

export type CanonStatus = (typeof STATUS)[keyof typeof STATUS]

export function normStatus(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

// 把历史值映射到统一大写
export function canonStatus(v: unknown): CanonStatus | 'UNKNOWN' {
  const s = normStatus(v)
  if (s === 'SCHEDULED' || s === 'BOOKED') return STATUS.SCHEDULED
  if (s === 'PENDING') return STATUS.SCHEDULED
  if (s === 'CONFIRMED') return STATUS.CONFIRMED
  if (s === 'COMPLETED' || s === 'DONE') return STATUS.COMPLETED
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return STATUS.CANCELLED
  return 'UNKNOWN'
}

export function isCancelled(v: unknown): boolean {
  const c = canonStatus(v)
  return c === STATUS.CANCELLED
}
