// lib/bookingStatus.ts
export const BOOKING_STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const

export type BookingStatus =
  (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]

export function normalizeBookingStatus(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

/**
 * 接受历史小写 / 兼容拼写 canceled/cancelled / 返回 Canonical 大写
 */
export function toBookingStatus(v: unknown): BookingStatus | null {
  const s = normalizeBookingStatus(v)
  if (!s) return null

  if (s === 'SCHEDULED') return BOOKING_STATUS.SCHEDULED
  if (s === 'CONFIRMED') return BOOKING_STATUS.CONFIRMED
  if (s === 'COMPLETED') return BOOKING_STATUS.COMPLETED

  // 兼容 canceled / cancelled
  if (s === 'CANCELLED' || s === 'CANCELED') return BOOKING_STATUS.CANCELLED

  // 兼容旧小写（normalize 后其实已经是大写，但这里留着表达意图）
  if (s === 'SCHEDULED') return BOOKING_STATUS.SCHEDULED
  if (s === 'CONFIRMED') return BOOKING_STATUS.CONFIRMED
  if (s === 'COMPLETED') return BOOKING_STATUS.COMPLETED
  if (s === 'CANCELLED') return BOOKING_STATUS.CANCELLED

  return null
}

export function isCompleted(v: unknown): boolean {
  return normalizeBookingStatus(v) === BOOKING_STATUS.COMPLETED
}
