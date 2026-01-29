// app/api/admin/timeoff/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'
import { parseClientTimeToUtcDate, startOfBizDayUtc, addBizDays } from '@/lib/tz'

export const runtime = 'nodejs'

type JsonObj = Record<string, unknown>

function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: Request): Promise<JsonObj> {
  try {
    const v = await req.json()
    return isJsonObj(v) ? v : {}
  } catch {
    return {}
  }
}

function parsePosInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) return n
  }
  return null
}

function parseNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function parseBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true') return true
    if (s === 'false') return false
  }
  return null
}

function parseDateTime(v: unknown): Date | null {
  return parseClientTimeToUtcDate(v)
}

function parseHHMM(v: unknown): { h: number; m: number } | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return { h: hh, m: mm }
}

function minutesOfDay(h: number, m: number) {
  return h * 60 + m
}

// yyyy-mm-dd => Date(当天 00:00:00, Asia/Shanghai)
function parseYMD(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const parsed = parseClientTimeToUtcDate(s)
  return parsed ? startOfBizDayUtc(s) : null
}

/**
 * GET /api/admin/timeoff?barberId=1
 * POST body:
 *   { barberId, type, ... }
 * type:
 *  - DATE_RANGE: startDate,endDate (yyyy-mm-dd) 或 startAt,endAt(ISO)
 *  - DATE_PARTIAL: startAt,endAt(ISO) 或 date + startTime/endTime(HH:mm)
 *  - DAILY: startTime/endTime(HH:mm) 或 startMinute/endMinute
 */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const barberId = parsePosInt(req.nextUrl.searchParams.get('barberId'))
    if (!barberId) {
      return NextResponse.json({ ok: false, error: 'Missing barberId' }, { status: 400 })
    }

    const rows = await prisma.barbertimeoff.findMany({
      where: { barberId, enabled: true },
      orderBy: { id: 'desc' },
    })

    return NextResponse.json({ ok: true, items: rows })
  } catch (err: any) {
    console.error('[admin/timeoff][GET] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal Server Error', detail: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const body = await readJson(req)

    const barberId = parsePosInt(body.barberId)
    const type = parseNonEmptyString(body.type)
    const note = parseNonEmptyString(body.note)
    const enabled = parseBool(body.enabled)

    if (!barberId || !type) {
      return NextResponse.json({ ok: false, error: 'Missing barberId/type' }, { status: 400 })
    }

    let startAt: Date | null = null
    let endAt: Date | null = null
    let startMinute: number | null = null
    let endMinute: number | null = null

    if (type === 'DATE_RANGE') {
      // 优先 startAt/endAt
      startAt = parseDateTime(body.startAt)
      endAt = parseDateTime(body.endAt)

      // 允许 startDate/endDate（更贴近运营后台）
      if (!startAt || !endAt) {
        const sd = parseYMD(body.startDate)
        const ed = parseYMD(body.endDate)
        if (!sd || !ed) {
          return NextResponse.json(
            { ok: false, error: 'DATE_RANGE needs startAt/endAt or startDate/endDate' },
            { status: 400 },
          )
        }
        startAt = sd
        // endDate 是“最后一天”，所以 endAt = endDate + 1 天 00:00（Asia/Shanghai）
        const endDateStr = addBizDays(body.endDate as string, 1)
        endAt = startOfBizDayUtc(endDateStr)
      }

      if (startAt >= endAt) {
        return NextResponse.json({ ok: false, error: 'Invalid range (start >= end)' }, { status: 400 })
      }
    } else if (type === 'DATE_PARTIAL') {
      startAt = parseDateTime(body.startAt)
      endAt = parseDateTime(body.endAt)

      // 也允许 date + startTime/endTime
      if (!startAt || !endAt) {
        const date = parseYMD(body.date)
        const st = parseHHMM(body.startTime)
        const et = parseHHMM(body.endTime)
        if (!date || !st || !et) {
          return NextResponse.json(
            { ok: false, error: 'DATE_PARTIAL needs startAt/endAt or date+startTime/endTime' },
            { status: 400 },
          )
        }
        startAt = parseClientTimeToUtcDate(`${body.date}T${String(st.h).padStart(2, '0')}:${String(st.m).padStart(2, '0')}:00`)
        endAt = parseClientTimeToUtcDate(`${body.date}T${String(et.h).padStart(2, '0')}:${String(et.m).padStart(2, '0')}:00`)
        if (!startAt || !endAt) {
          return NextResponse.json(
            { ok: false, error: 'Invalid date/time format' },
            { status: 400 },
          )
        }
      }

      if (startAt >= endAt) {
        return NextResponse.json({ ok: false, error: 'Invalid range (start >= end)' }, { status: 400 })
      }
    } else if (type === 'DAILY') {
      // 优先 startMinute/endMinute
      startMinute = typeof body.startMinute === 'number' ? body.startMinute : null
      endMinute = typeof body.endMinute === 'number' ? body.endMinute : null

      if (startMinute == null || endMinute == null) {
        const st = parseHHMM(body.startTime)
        const et = parseHHMM(body.endTime)
        if (!st || !et) {
          return NextResponse.json(
            { ok: false, error: 'DAILY needs startMinute/endMinute or startTime/endTime' },
            { status: 400 },
          )
        }
        startMinute = minutesOfDay(st.h, st.m)
        endMinute = minutesOfDay(et.h, et.m)
      }

      if (startMinute == null || endMinute == null || startMinute >= endMinute) {
        return NextResponse.json({ ok: false, error: 'Invalid minutes (start >= end)' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ ok: false, error: 'Unknown type' }, { status: 400 })
    }

    const created = await prisma.barbertimeoff.create({
      data: {
        barberId,
        type,
        startAt,
        endAt,
        startMinute,
        endMinute,
        enabled: enabled ?? true,
        note: note ?? null,
      },
    })

    return NextResponse.json({ ok: true, item: created }, { status: 201 })
  } catch (err: any) {
    console.error('[admin/timeoff][POST] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal Server Error', detail: err?.message }, { status: 500 })
  }
}
