// lib/status.ts
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

// 把历史值映射到统一大写（兼容旧值/别名）
export function canonStatus(v: unknown): CanonStatus | 'UNKNOWN' {
  const s = normStatus(v)
  if (!s) return 'UNKNOWN'

  // 预约中
  if (s === 'SCHEDULED' || s === 'BOOKED' || s === 'PENDING') return STATUS.SCHEDULED

  // 已确认
  if (s === 'CONFIRMED') return STATUS.CONFIRMED

  // 已完成
  if (s === 'COMPLETED' || s === 'DONE') return STATUS.COMPLETED

  // 已取消（兼容美式拼写/简写）
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return STATUS.CANCELLED

  return 'UNKNOWN'
}

export function isCancelled(v: unknown): boolean {
  return canonStatus(v) === STATUS.CANCELLED
}

export function isCompleted(v: unknown): boolean {
  return canonStatus(v) === STATUS.COMPLETED
}

export function statusLabelZh(v: unknown): string {
  const c = canonStatus(v)
  if (c === STATUS.COMPLETED) return '已完成'
  if (c === STATUS.CANCELLED) return '已取消'
  if (c === STATUS.CONFIRMED) return '已确认'
  if (c === STATUS.SCHEDULED) return '已预约'
  return normStatus(v) || '-'
}
