import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { STATUS } from '@/lib/status'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export const runtime = 'nodejs'

const SLOT_MINUTES = 30
const CN_OFFSET_MS = 8 * 60 * 60 * 1000

// ✅ 线上规则：需提前预约 X 分钟（门店 admin 可绕过）
const MIN_ADVANCE_MINUTES = 60

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// ✅ 把 Date 转成中国本地 YYYY-MM-DD（不依赖服务器时区）
function toCN_YMD(d: Date) {
  const ms = d.getTime() + CN_OFFSET_MS
  const x = new Date(ms)
  return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())}`
}

// ✅ 强制按中国时区切天（+08:00）
function cnDayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

// ✅ 解析 startTime：
// - 如果带 Z 或 +08:00 之类时区：直接 new Date
// - 如果不带时区：默认按中国时区 +08:00 解析（避免服务器是 UTC 时翻车）
function parseStartTimeCN(input: any): Date | null {
  if (input == null) return null
  let s = String(input).trim()
  if (!s) return null

  // 兼容 "YYYY-MM-DD HH:mm:ss"
  s = s.replace(' ', 'T')

  // 补秒：YYYY-MM-DDTHH:mm -> + ":00"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'

  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(s)
  const iso = hasTz ? s : `${s}+08:00`

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function onlyDigits11(phone: string) {
  const digits = phone.replace(/\s+/g, '')
  return /^\d{11}$/.test(digits)
}

// ✅ tx 类型必须是 TransactionClient
async function calcFinalPrice(tx: Tx, barberId: number, serviceId: number) {
  const bs = await tx.barberservice.findUnique({
    where: { barberId_serviceId: { barberId, serviceId } },
    select: { price: true },
  })
  if (bs && typeof bs.price === 'number') return bs.price

  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { price: true },
  })
  if (!svc) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return svc.price
}

async function getServiceDuration(tx: Tx, serviceId: number) {
  const svc = await tx.service.findUnique({
    where: { id: serviceId },
    select: { durationMinutes: true },
  })
  if (!svc) throw new Error(`服务不存在: serviceId=${serviceId}`)
  return svc.durationMinutes ?? SLOT_MINUTES
}

// ✅ 可选：校验理发师营业时间（你 barber 表里有 workStartHour/workEndHour）
async function getBarberWorkHours(tx: Tx, barberId: number) {
  const b = await tx.barber.findUnique({
    where: { id: barberId },
    select: { workStartHour: true, workEndHour: true },
  })
  // 兜底
  return {
    startHour: b?.workStartHour ?? 10,
    endHour: b?.workEndHour ?? 21,
  }
}

function cnMinutesOfDay(d: Date) {
  const ms = d.getTime() + CN_OFFSET_MS
  const x = new Date(ms)
  return x.getUTCHours() * 60 + x.getUTCMinutes()
}

// GET /api/bookings?date=YYYY-MM-DD&shopId=1&barberId=1&phone=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const shopId = searchParams.get('shopId')
    const barberId = searchParams.get('barberId')
    const phone = searchParams.get('phone')

    const where: any = {}

    if (date) {
      const { start, end } = cnDayRange(date)
      where.startTime = { gte: start, lt: end }
    }
    if (shopId) where.shopId = Number(shopId)
    if (barberId) where.barberId = Number(barberId)
    if (phone) where.phone = phone

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        shop: { select: { name: true } },
        barber: { select: { name: true } },
        service: { select: { name: true, price: true, durationMinutes: true } },
      },
    })

    return NextResponse.json({ success: true, bookings }, { status: 200 })
  } catch (error) {
    console.error('GET /api/bookings error', error)
    return NextResponse.json(
      { success: false, error: 'GET 服务器错误', message: 'GET 服务器错误' },
      { status: 500 },
    )
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { shopId, barberId, serviceId, userName, phone, startTime, source } = body || {}

    // ✅ phone 改为可选
    if (!shopId || !barberId || !serviceId || !userName || !startTime) {
      return NextResponse.json(
        { success: false, error: '缺少必要字段', message: '缺少必要字段' },
        { status: 400 },
      )
    }

    const start = parseStartTimeCN(startTime)
    if (!start) {
      return NextResponse.json(
        { success: false, error: `startTime 格式不正确: ${startTime}`, message: 'startTime 格式不正确' },
        { status: 400 },
      )
    }

    // ✅ 30分钟对齐校验（防止绕过前端乱传）
    const slotMs = SLOT_MINUTES * 60 * 1000
    if (start.getTime() % slotMs !== 0) {
      return NextResponse.json(
        { success: false, error: 'startTime 必须为 30 分钟整点（:00 或 :30）', message: 'startTime 必须为 30 分钟整点' },
        { status: 400 },
      )
    }

    const barberIdNum = Number(barberId)
    const serviceIdNum = Number(serviceId)
    const shopIdNum = Number(shopId)

    if (Number.isNaN(barberIdNum) || Number.isNaN(serviceIdNum) || Number.isNaN(shopIdNum)) {
      return NextResponse.json(
        { success: false, error: 'shopId/barberId/serviceId 必须为数字', message: 'id 参数不合法' },
        { status: 400 },
      )
    }

    const phoneStr = phone == null ? null : String(phone).trim()
    if (phoneStr && !onlyDigits11(phoneStr)) {
      return NextResponse.json(
        { success: false, error: '手机号格式不对（需 11 位数字）', message: '手机号格式不对' },
        { status: 400 },
      )
    }

    const sourceStr = (source ? String(source) : '').toLowerCase() || 'miniapp' // 保持你原兼容
    const isAdmin = sourceStr === 'admin'

    // ✅ 提前预约限制（门店 admin 绕过）
    if (!isAdmin) {
      const diffMin = (start.getTime() - Date.now()) / 60000
      if (diffMin < MIN_ADVANCE_MINUTES) {
        return NextResponse.json(
          { success: false, error: `需至少提前 ${MIN_ADVANCE_MINUTES} 分钟预约`, message: '预约过于临近' },
          { status: 400 },
        )
      }
    }

    const dateStr = toCN_YMD(start)
    const lockKey = `bf:barber:${barberIdNum}:${dateStr}`

    const result = await prisma.$transaction(async (tx) => {
      const gotRows = await tx.$queryRaw<Array<{ got: any }>>`
        SELECT GET_LOCK(${lockKey}, 3) AS got
      `
      const got = Number(gotRows?.[0]?.got ?? 0)
      if (got !== 1) return { kind: 'busy' as const }

      try {
        const { start: dayStart, end: dayEnd } = cnDayRange(dateStr)

        const duration = await getServiceDuration(tx, serviceIdNum)
        const newEnd = addMinutes(start, duration)

        // ✅ 校验营业时间（按 barber.workStartHour/workEndHour）
        const { startHour, endHour } = await getBarberWorkHours(tx, barberIdNum)
        const startMin = cnMinutesOfDay(start)
        const endMin = startMin + duration
        if (startMin < startHour * 60 || endMin > endHour * 60) {
          return { kind: 'out_of_hours' as const, startHour, endHour }
        }

        // ✅ 查当天占用单：以 slotLock=true 为准
        const exist = await tx.booking.findMany({
          where: {
            barberId: barberIdNum,
            startTime: { gte: dayStart, lt: dayEnd },
            slotLock: true,
          },
          include: { service: { select: { durationMinutes: true } } },
          orderBy: { startTime: 'asc' },
        })

        // ✅ 重叠检测：start < bEnd && newEnd > b.startTime
        const conflict = exist.some((b) => {
          const dur = b.service?.durationMinutes ?? SLOT_MINUTES
          const bEnd = addMinutes(b.startTime, dur)
          return start < bEnd && newEnd > b.startTime
        })
        if (conflict) return { kind: 'conflict' as const }

        const finalPrice = await calcFinalPrice(tx, barberIdNum, serviceIdNum)

        const booking = await tx.booking.create({
          data: {
            shopId: shopIdNum,
            barberId: barberIdNum,
            serviceId: serviceIdNum,
            userName: String(userName),
            phone: phoneStr || null,
            startTime: start,
            source: sourceStr,
            status: STATUS.SCHEDULED,
            slotLock: true,
            price: finalPrice,
          },
        })

        return { kind: 'ok' as const, booking }
      } catch (e: any) {
        if (e?.code === 'P2002') return { kind: 'conflict' as const }
        throw e
      } finally {
        try {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey}) AS released`
        } catch (e) {
          console.error('RELEASE_LOCK failed:', e)
        }
      }
    })

    if (result.kind === 'busy') {
      return NextResponse.json(
        { success: false, error: '系统繁忙，请稍后再试', message: '系统繁忙' },
        { status: 503 },
      )
    }
    if (result.kind === 'out_of_hours') {
      return NextResponse.json(
        { success: false, error: `不在营业时间内（${result.startHour}:00 ~ ${result.endHour}:00）`, message: '不在营业时间内' },
        { status: 400 },
      )
    }
    if (result.kind === 'conflict') {
      return NextResponse.json(
        { success: false, error: '该时间段已被预约，请换一个时间', message: '该时间段已被预约' },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, booking: result.booking }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/bookings error', error)
    return NextResponse.json(
      { success: false, error: '服务器开小差了，请稍后再试', message: '服务器错误' },
      { status: 500 },
    )
  }
}
