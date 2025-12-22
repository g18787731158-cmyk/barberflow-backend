// app/api/bookings/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ✅ 你要更严格的话，把这个改成 true：必须先 ARRIVED 才能 COMPLETED
const MUST_ARRIVE_BEFORE_COMPLETE = false

// ✅ 允许修改最近 N 天（含今天）
const EDITABLE_DAYS = 3

const ALLOWED = new Set(['BOOKED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELED'])

function normalizeStatusIn(raw: any) {
  const s = String(raw || '').trim()
  const up = s.toUpperCase()

  // 兼容前端/历史传法
  if (up === 'PENDING' || up === 'SCHEDULED' || up === 'BOOKED') return 'BOOKED'
  if (up === 'CANCELLED' || up === 'CANCELED') return 'CANCELED'
  if (up === 'DONE' || up === 'COMPLETED') return 'COMPLETED'
  if (up === 'ARRIVED') return 'ARRIVED'
  if (up === 'NO_SHOW' || up === 'NOSHOW') return 'NO_SHOW'
  return up
}

// ---- CN(UTC+8) 时间工具：保证“按中国日期”判断 ----
function cnDateStr(date = new Date()) {
  const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return utc8.toISOString().slice(0, 10) // YYYY-MM-DD
}

function cnStartOfDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000+08:00`)
}

function cnEndOfDay(dateStr: string) {
  return new Date(`${dateStr}T23:59:59.999+08:00`)
}

function shiftCnDateStr(dateStr: string, deltaDays: number) {
  const base = cnStartOfDay(dateStr)
  const shifted = new Date(base.getTime() + deltaDays * 24 * 60 * 60 * 1000)
  const utc8 = new Date(shifted.getTime() + 8 * 60 * 60 * 1000)
  return utc8.toISOString().slice(0, 10)
}

// POST /api/bookings/status
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const bookingId = body.bookingId ?? body.id
    const rawStatus = body.status

    if (!bookingId || !rawStatus) {
      return NextResponse.json({ success: false, message: '缺少 id 或 status' }, { status: 400 })
    }

    const id = Number(bookingId)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, message: 'id 必须是数字' }, { status: 400 })
    }

    const status = normalizeStatusIn(rawStatus)
    if (!ALLOWED.has(status)) {
      return NextResponse.json(
        { success: false, message: '非法 status', allowed: Array.from(ALLOWED) },
        { status: 400 }
      )
    }

    const existing = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, status: true, startTime: true },
    })
    if (!existing) {
      return NextResponse.json({ success: false, message: `未找到 id=${id} 的预约` }, { status: 404 })
    }

    // ✅ 最近 3 天可改（含今天）
    const today = cnDateStr()
    const startStr = shiftCnDateStr(today, -(EDITABLE_DAYS - 1)) // 3天 => today-2
    const allowedStart = cnStartOfDay(startStr).getTime()
    const allowedEnd = cnEndOfDay(today).getTime()
    const bookingTime = new Date(existing.startTime).getTime()

    if (bookingTime < allowedStart || bookingTime > allowedEnd) {
      const res = NextResponse.json(
        { success: false, message: `仅允许修改最近${EDITABLE_DAYS}天的预约（${startStr} ~ ${today}）` },
        { status: 403 }
      )
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    // 状态没变，直接成功
    const cur = normalizeStatusIn(existing.status)
    if (cur === status) {
      const res = NextResponse.json({ success: true, booking: { id: existing.id, status: cur } }, { status: 200 })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    if (MUST_ARRIVE_BEFORE_COMPLETE && status === 'COMPLETED') {
      if (cur !== 'ARRIVED') {
        return NextResponse.json(
          { success: false, message: '必须先标记到店(ARRIVED)才能完成(COMPLETED)' },
          { status: 400 }
        )
      }
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })

    const res = NextResponse.json({ success: true, booking }, { status: 200 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error: any) {
    console.error('POST /api/bookings/status error', error)
    return NextResponse.json(
      { success: false, message: '更新预约状态失败', error: String(error) },
      { status: 500 }
    )
  }
}
