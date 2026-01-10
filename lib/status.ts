export const STATUS = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const

export type CanonStatus = (typeof STATUS)[keyof typeof STATUS] | string

export function canonStatus(raw: unknown): CanonStatus {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''

  if (s === 'CANCELLED' || s === 'CANCELED') return STATUS.CANCELED
  if (s === 'SCHEDULED') return STATUS.SCHEDULED
  if (s === 'CONFIRMED') return STATUS.CONFIRMED
  if (s === 'COMPLETED') return STATUS.COMPLETED

  return s
}
