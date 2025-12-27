// app/api/miniapp/available-slots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
const DEFAULT_WORK_START = 10
const DEFAULT_WORK_END = 21

// ✅ 至少提前“1个日历日”预约：今天只能约明天及以后（不要求满24小时）
const MIN_ADVANCE_DAYS = 1

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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

    // ✅ 提前“日历天”限制：今天只能约明天及以后
    const now = new Date()
    const minDateStr = formatYMD(addDays(now, MIN_ADVANCE_DAYS))
    const tooSoon = date < minDateStr

    // 1) 取理发师工作时间（没有就用默认 10-21）
    const barber = await prisma.barber.findUnique({
      where: { id: barberId },
      select: { workStartHour: true, workEndHour: true },
    })
    const workStartHour = barber?.workStartHour ?? DEFAULT_WORK_START
    const workEndHour = barber?.workEndHour ?? DEFAULT_WORK_END

    // 2) 取“当前选择服务”的时长（没有 serviceId 就按 30 分钟）
    let wantedDuration = SLOT_MINUTES
    if (serviceId) {
      const svc = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { durationMinutes: true },
      })
      if (svc?.durationMinutes && svc.durationMinutes > 0) {
        wantedDuration = svc.durationMinutes
      }
    }

    const { dayStart, dayEnd, y, m, d } = buildDay(date)
    const slotsStart = new Date(y, m - 1, d, workStartHour, 0, 0)
    const slotsEnd = new Date(y, m - 1, d, workEndHour, 0, 0)

    // 3) 当天所有“仍占用时段”的订单（slotLock=true）
    const exist = await prisma.booking.findMany({
      where: {
        barberId,
        startTime: { gte: dayStart, lt: dayEnd },
        slotLock: true,
      },
      include: { service: { select: { durationMinutes: true } } },
      orderBy: { startTime: 'asc' },
    })

    const occupied = exist.map((b) => {
      const dur = b.service?.durationMinutes ?? SLOT_MINUTES
      return { start: b.startTime, end: addMinutes(b.startTime, dur) }
    })

    // 4) 生成半小时 slots，并按 “服务时长 wantedDuration” 判断是否可选
    const out: Array<{ time: string; label: string; disabled: boolean }> = []

    for (let t = new Date(slotsStart); t < slotsEnd; t = addMinutes(t, SLOT_MINUTES)) {
      const end = addMinutes(t, wantedDuration)
      let disabled = false

      // ✅ 如果不满足“提前日历天”，直接全禁用（仍返回列表，前端稳）
      if (tooSoon) disabled = true

      // 服务必须能在下班前做完
      if (!disabled && end > slotsEnd) disabled = true

      // 与任意占用区间重叠则禁用（关键：90min 不会被插队）
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
