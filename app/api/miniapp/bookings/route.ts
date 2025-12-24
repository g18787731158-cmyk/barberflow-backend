import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS } from '@/lib/status'

export const runtime = 'nodejs'

type JsonObj = Record<string, unknown>

function isJsonObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: Request): Promise<JsonObj | null> {
  try {
    const v = await req.json()
    return isJsonObj(v) ? v : null
  } catch {
    return null
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

// 把 "2025-12-06" + "14:30" 拼成一个 Date（按服务器时区）
function buildStartTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`)
}

export async function POST(req: Request) {
  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const shopId = parsePosInt(body.shopId)
  const barberId = parsePosInt(body.barberId)
  const serviceId = parsePosInt(body.serviceId)
  const date = parseNonEmptyString(body.date)
  const time = parseNonEmptyString(body.time)
  const userName = parseNonEmptyString(body.userName)
  const phone = parseNonEmptyString(body.phone)

  if (!shopId || !barberId || !serviceId || !date || !time || !userName || !phone) {
    return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
  }

  const startTime = buildStartTime(date, time)
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json({ error: 'date/time 格式不正确' }, { status: 400 })
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        shopId,
        barberId,
        serviceId,
        startTime,
        status: STATUS.SCHEDULED,
        userName,
        phone,
        source: 'miniapp',
      },
    })

    return NextResponse.json({ ok: true, booking }, { status: 201 })
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'P2002') {
      return NextResponse.json({ ok: false, error: '该时段已被预约' }, { status: 409 })
    }

    console.error('[miniapp/bookings] error:', e)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
