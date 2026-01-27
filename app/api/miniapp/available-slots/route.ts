// app/api/miniapp/available-slots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  startOfBizDayUtc,
  endOfBizDayUtc,
  parseClientTimeToUtcDate,
  addBizDays,
  bizDateString,
  utcDateToBizMinutes,
} from '@/lib/tz'

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
const MIN_ADVANCE_DAYS = 1 // 今天只能约明天及以后（不要求满24小时）

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// "2025-12-06" + "14:30" => Date（按业务时区解析）
function buildStartTime(dateStr: string, timeStr: string): Date | null {
  return parseClientTimeToUtcDate(`${dateStr}T${timeStr}:00`)
}

function minutesSince00(d: Date) {
  return utcDateToBizMinutes(d)
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || ''
    const barberId = Number(req.nextUrl.searchParams.get('barberId') || '')
    const serviceId = Number(req.nextUrl.searchParams.get('serviceId') || '')

    if (!date || !barberId || !serviceId || Number.isNaN(barberId) || Number.isNaN(serviceId)) {
      return NextResponse.json({ error: 'Missing date/barberId/serviceId' }, { status: 400 })
    }
    if (!parseClientTimeToUtcDate(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }

    const minDateStr = addBizDays(bizDateString(), MIN_ADVANCE_DAYS)
    const calendarTooEarly = date < minDateStr

    const dayStart = startOfBizDayUtc(date)
    const dayEnd = endOfBizDayUtc(date)

    const [barber, service, bookings, timeoffs] = await prisma.$transaction([
      prisma.barber.findUnique({
        where: { id: barberId },
        select: { id: true, workStartHour: true, workEndHour: true },
      }),
      prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, durationMinutes: true },
      }),
      prisma.booking.findMany({
        where: {
          barberId,
          startTime: { gte: dayStart, lt: dayEnd },
          slotLock: true,
        },
        include: { service: { select: { durationMinutes: true } } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.barbertimeoff.findMany({
        where: { barberId, enabled: true },
        orderBy: { id: 'desc' },
      }),
    ])

    if (!barber) return NextResponse.json({ error: 'barber not found' }, { status: 404 })
    if (!service) return NextResponse.json({ error: 'service not found' }, { status: 404 })

    const duration = service.durationMinutes ?? SLOT_MINUTES

    // 生成 slots：从 workStartHour 到 workEndHour（最后一个 slot 必须能放下服务时长）
    const slots: Array<{ time: string; label: string; disabled: boolean }> = []

    const startH = barber.workStartHour ?? 10
    const endH = barber.workEndHour ?? 21

    for (let h = startH; h <= endH; h++) {
      for (const m of [0, 30]) {
        const time = `${pad2(h)}:${pad2(m)}`
        const st = buildStartTime(date, time)
        if (!st) continue

        const en = addMinutes(st, duration)

        // 超出营业结束
        const endBoundary = buildStartTime(date, `${pad2(endH)}:00`)
        if (!endBoundary) continue
        if (en > endBoundary) continue

        let disabled = false

        // ✅ 日历天提前预约规则：今天不能约今天
        if (calendarTooEarly) disabled = true

        // ✅ timeoff 规则
        if (!disabled && timeoffs.length) {
          const hit = timeoffs.some((t) => {
            if (t.type === 'DATE_RANGE' || t.type === 'DATE_PARTIAL') {
              if (!t.startAt || !t.endAt) return false
              return overlap(st, en, t.startAt, t.endAt)
            }
            if (t.type === 'DAILY') {
              if (typeof t.startMinute !== 'number' || typeof t.endMinute !== 'number') return false
              const sMin = minutesSince00(st)
              const eMin = sMin + duration
              return sMin < t.endMinute && eMin > t.startMinute
            }
            return false
          })
          if (hit) disabled = true
        }

        // ✅ booking 冲突（按服务时长重叠）
        if (!disabled && bookings.length) {
          const conflict = bookings.some((b) => {
            const dur = b.service?.durationMinutes ?? SLOT_MINUTES
            const bEnd = addMinutes(b.startTime, dur)
            return overlap(st, en, b.startTime, bEnd)
          })
          if (conflict) disabled = true
        }

        slots.push({ time, label: time, disabled })
      }
    }

    return NextResponse.json(slots)
  } catch (e: any) {
    console.error('[miniapp/available-slots] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
