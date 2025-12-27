import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

type JsonObj = Record<string, unknown>
function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}
async function readJson(req: NextRequest): Promise<JsonObj> {
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
function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}
function dayStart(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0)
}
function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
function buildDateTime(dateStr: string, hm: string) {
  return new Date(`${dateStr}T${hm}:00`)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const barberId = parsePosInt(searchParams.get('barberId'))
    if (!barberId) {
      return NextResponse.json({ ok: false, error: 'barberId required' }, { status: 400 })
    }

    const rows = await prisma.barbertimeoff.findMany({
      where: { barberId, enabled: true },
      orderBy: { id: 'desc' },
    })

    return NextResponse.json({ ok: true, items: rows })
  } catch (e: any) {
    console.error('[admin/timeoff][GET] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error', detail: e?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req)
    const barberId = parsePosInt(body.barberId)
    const type = parseNonEmptyString(body.type)
    const note = parseNonEmptyString(body.note) ?? undefined
    const enabled = body.enabled === false ? false : true

    if (!barberId || !type) {
      return NextResponse.json({ ok: false, error: 'barberId/type required' }, { status: 400 })
    }

    if (!['DATE_RANGE', 'DATE_PARTIAL', 'DAILY'].includes(type)) {
      return NextResponse.json({ ok: false, error: 'type must be DATE_RANGE/DATE_PARTIAL/DAILY' }, { status: 400 })
    }

    if (type === 'DAILY') {
      const startTime = parseNonEmptyString(body.startTime)
      const endTime = parseNonEmptyString(body.endTime)
      if (!startTime || !endTime) {
        return NextResponse.json({ ok: false, error: 'DAILY requires startTime/endTime (HH:mm)' }, { status: 400 })
      }
      const sm = parseHM(startTime)
      const em = parseHM(endTime)
      if (sm === null || em === null || em <= sm) {
        return NextResponse.json({ ok: false, error: 'invalid startTime/endTime' }, { status: 400 })
      }

      const row = await prisma.barbertimeoff.create({
        data: { barberId, type, startMinute: sm, endMinute: em, enabled, note },
      })
      return NextResponse.json({ ok: true, item: row }, { status: 201 })
    }

    if (type === 'DATE_PARTIAL') {
      const date = parseNonEmptyString(body.date)
      const startTime = parseNonEmptyString(body.startTime)
      const endTime = parseNonEmptyString(body.endTime)
      if (!date || !startTime || !endTime) {
        return NextResponse.json({ ok: false, error: 'DATE_PARTIAL requires date/startTime/endTime' }, { status: 400 })
      }
      const startAt = buildDateTime(date, startTime)
      const endAt = buildDateTime(date, endTime)
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        return NextResponse.json({ ok: false, error: 'invalid date/time' }, { status: 400 })
      }

      const row = await prisma.barbertimeoff.create({
        data: { barberId, type, startAt, endAt, enabled, note },
      })
      return NextResponse.json({ ok: true, item: row }, { status: 201 })
    }

    // DATE_RANGE：endDate 包含在内，所以 endAt=结束次日00:00
    const startDate = parseNonEmptyString(body.startDate)
    const endDate = parseNonEmptyString(body.endDate)
    if (!startDate || !endDate) {
      return NextResponse.json({ ok: false, error: 'DATE_RANGE requires startDate/endDate' }, { status: 400 })
    }

    const s0 = dayStart(startDate)
    const e0 = addDays(dayStart(endDate), 1)
    if (Number.isNaN(s0.getTime()) || Number.isNaN(e0.getTime()) || e0 <= s0) {
      return NextResponse.json({ ok: false, error: 'invalid startDate/endDate' }, { status: 400 })
    }

    const row = await prisma.barbertimeoff.create({
      data: { barberId, type, startAt: s0, endAt: e0, enabled, note },
    })
    return NextResponse.json({ ok: true, item: row }, { status: 201 })
  } catch (e: any) {
    console.error('[admin/timeoff][POST] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error', detail: e?.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = parsePosInt(searchParams.get('id'))
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    }

    await prisma.barbertimeoff.update({
      where: { id },
      data: { enabled: false },
    })
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    console.error('[admin/timeoff][DELETE] error:', e)
    return NextResponse.json({ ok: false, error: 'Internal Server Error', detail: e?.message }, { status: 500 })
  }
}
