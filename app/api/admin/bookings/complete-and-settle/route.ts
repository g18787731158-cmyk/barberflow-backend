import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'

function floorInt(n: number) {
  return Math.floor(n)
}

export async function POST(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = Number(body.bookingId)
    if (!bookingId) {
      return NextResponse.json({ ok: false, error: 'bookingId required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          completedAt: true,
          shopId: true,
          price: true,
          service: { select: { price: true } },
        },
      })

      if (!booking) {
        return { status: 404 as const, payload: { ok: false, error: 'booking not found' } }
      }

      // 1) 完成：保证 COMPLETED + completedAt
      if (booking.status !== 'COMPLETED') {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        })
      } else if (!booking.completedAt) {
        await tx.booking.update({
          where: { id: bookingId },
          data: { completedAt: new Date() },
        })
      }

      // 2) 幂等：已结算就直接返回
      const existing = await tx.ledger.findFirst({
        where: { bookingId, type: 'SETTLE' },
        select: { id: true, bookingId: true, amount: true, status: true, detail: true, createdAt: true },
      })
      if (existing) {
        return {
          status: 200 as const,
          payload: { ok: true, settled: true, alreadySettled: true, ledger: existing },
        }
      }

      // 3) 算钱
      const shop = await tx.shop.findUnique({
        where: { id: booking.shopId },
        select: { platformShareBasis: true, barberShareBasis: true },
      })

      const amountTotal = Number(booking.price ?? booking.service?.price ?? 0)
      const platformFeeBps = Number(shop?.platformShareBasis ?? 0)
      const barberFeeBps = Number(shop?.barberShareBasis ?? 0)

      const platformFeeAmount = floorInt((amountTotal * platformFeeBps) / 10000)
      const barberFeeAmount = floorInt((amountTotal * barberFeeBps) / 10000)
      const shopAmount = amountTotal - platformFeeAmount - barberFeeAmount

      const breakdown = {
        amountTotal,
        platformFeeBps,
        platformFeeAmount,
        barberFeeBps,
        barberFeeAmount,
        shopAmount,
        basis: 'bps/10000',
        computedAt: new Date().toISOString(),
      }

      const ledger = await tx.ledger.create({
        data: {
          bookingId,
          type: 'SETTLE',
          amount: amountTotal,
          status: 'CREATED',
          detail: JSON.stringify(breakdown),
        },
        select: { id: true, bookingId: true, amount: true, status: true, detail: true, createdAt: true },
      })

      return {
        status: 200 as const,
        payload: { ok: true, settled: true, alreadySettled: false, ledger, breakdown },
      }
    })

    return NextResponse.json(result.payload, { status: result.status })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'server error' }, { status: 500 })
  }
}
