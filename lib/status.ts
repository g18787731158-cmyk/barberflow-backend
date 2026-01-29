export const BOOKING_STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELED: 'CANCELED',
} as const

export const STATUS = BOOKING_STATUS
export const STATUS_CANCEL = BOOKING_STATUS.CANCELED

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]
export type CanonStatus = BookingStatus | string

export function normalizeBookingStatus(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

export function canonStatus(raw: unknown): CanonStatus {
  const s = normalizeBookingStatus(raw)
  if (!s) return ''

  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return STATUS_CANCEL
  if (s === 'NO_SHOW') return STATUS.NO_SHOW
  if (s === 'SCHEDULED') return STATUS.SCHEDULED
  if (s === 'CONFIRMED') return STATUS.CONFIRMED
  if (s === 'COMPLETED') return STATUS.COMPLETED

  return s
}

export function toBookingStatus(v: unknown): BookingStatus | null {
  const s = normalizeBookingStatus(v)
  if (!s) return null

  if (s === 'SCHEDULED') return BOOKING_STATUS.SCHEDULED
  if (s === 'CONFIRMED') return BOOKING_STATUS.CONFIRMED
  if (s === 'COMPLETED') return BOOKING_STATUS.COMPLETED

  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return BOOKING_STATUS.CANCELED
  if (s === 'NO_SHOW') return BOOKING_STATUS.NO_SHOW

  return null
}

export function isCompleted(v: unknown): boolean {
  return normalizeBookingStatus(v) === BOOKING_STATUS.COMPLETED
}
