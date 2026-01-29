// ✅ 纯工具：不要 import prisma / service / db

export function now() {
  return new Date()
}

export function isoNow() {
  return new Date().toISOString()
}

export function toDate(input: string | number | Date) {
  return input instanceof Date ? input : new Date(input)
}

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000)
}

export function clampToMinute(d: Date) {
  const x = new Date(d)
  x.setSeconds(0, 0)
  return x
}
