import { BOOKING_STATUS, canonStatus, toBookingStatus } from '@/lib/status'

describe('booking status helpers', () => {
  it('normalizes canceled spellings to CANCELED', () => {
    expect(canonStatus('cancelled')).toBe(BOOKING_STATUS.CANCELED)
    expect(canonStatus('CANCEL')).toBe(BOOKING_STATUS.CANCELED)
  })

  it('returns null for invalid status', () => {
    expect(toBookingStatus('not-a-status')).toBeNull()
  })
})
