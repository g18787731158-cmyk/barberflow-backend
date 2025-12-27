import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
const DEFAULT_WORK_START = 10
const DEFAULT_WORK_END = 21
const MIN_ADVANCE_MINUTES = 60

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toHM(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function buildDay(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayStart = new Date(y, m - 1, d, 0, 0, 0)
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0)
  return { dayStart, dayEnd, y, m, d }
}

function parsePosInt(v: string | null) {
  if (!v) return null
  const n = Number(v)
  if (Number.isInteger(n) && n > 0) return n
  return null
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const barberId = parsePosInt(searchParams.get('barberId'))
    const serviceId = parsePosInt(searchParams.get('serviceId'))

    if (!date || !barberId) {
      return NextResponse.json({ error: 'date / barberId 必填' }, { status: 400 })
    }

    const barber = await prisma.barber.findUnique({
      where: { id: barberId },
      select: { workStartHour: true, workEndHour: true },
    })
    const workStartHour = barber?.workStartHour ?? DEFAULT_WORK_START
    const workEndHour = barber?.workEndHour ?? DEFAULT_WORK_END

    let wantedDuration = SLOT_MINUTES
    if (serviceId) {
      const svc = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { durationMinutes: true },
      })
      if (svc?.durationMinutes && svc.durationMinutes > 0) wantedDuration = svc.durationMinutes
    }

    const { dayStart, dayEnd, y, m, d } = buildDay(date)
    const slotsStart = new Date(y, m - 1, d, workStartHour, 0, 0)
    const slotsEnd = new Date(y, m - 1, d, workEndHour, 0, 0)

    // ✅ 只取必要字段（避免 Prisma 去读不存在的列/脏数据炸）
    const exist = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: { gte: dayStart, lt: dayEnd },
        slotLock: true,
      },
      select: { startTime: true, serviceId: true },
      orderBy: { startTime: 'asc' },
    })

    const serviceIds = Array.from(new Set(exist.map((b) => b.serviceId)))
    const svcs = serviceIds.length
      ? await prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, durationMinutes: true },
        })
      : []

    const durMap = new Map<number, number>()
    for (const s of svcs) durMap.set(s.id, s.durationMinutes || SLOT_MINUTES)

    const occupied = exist.map((b) => {
      const dur = durMap.get(b.serviceId) ?? SLOT_MINUTES
      return { start: b.startTime, end: addMinutes(b.startTime, dur) }
    })

    const now = new Date()
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    const minStart = date === todayStr ? addMinutes(now, MIN_ADVANCE_MINUTES) : null

    const out: Array<{ time: string; label: string; disabled: boolean }> = []

    for (let t = new Date(slotsStart); t < slotsEnd; t = addMinutes(t, SLOT_MINUTES)) {
      const end = addMinutes(t, wantedDuration)
      let disabled = false

      if (end > slotsEnd) disabled = true
      if (!disabled && minStart && t < minStart) disabled = true

      if (!disabled) {
        for (const o of occupied) {
          if (overlap(t, end, o.start, o.end)) {
            disabled = true
            break
          }
        }
      }

      const hm = toHM(t)
      out.push({ time: hm, label: hm, disabled })
    }

    return NextResponse.json(out, { status: 200 })
  } catch (e) {
    console.error('[miniapp/available-slots] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
