import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth/admin'

export const runtime = 'nodejs'

type JsonObj = Record<string, unknown>

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null
}

async function readJson(req: Request): Promise<JsonObj | null> {
  try {
    const v = await req.json()
    return isObj(v) ? v : null
  } catch {
    return null
  }
}

function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export async function POST(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) return auth.res

  const body = await readJson(req)
  if (!body) {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const shopId = toInt(body.shopId ?? body.id)
  if (!shopId || shopId <= 0) {
    return NextResponse.json({ ok: false, error: '缺少或非法 shopId' }, { status: 400 })
  }

  // bps: 200=2%，万分比
  const platformShareBasisRaw = toInt(body.platformShareBasis)
  const barberShareBasisRaw = toInt(body.barberShareBasis)

  // 允许只改其中一个：没传就保持原值
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        platformShareBasis: true,
        barberShareBasis: true,
        shopShareBasis: true,
        enableAutoSplit: true,
        updatedAt: true,
      },
    })

    if (!shop) {
      return NextResponse.json({ ok: false, error: 'shop 不存在' }, { status: 404 })
    }

    const nextPlatform = platformShareBasisRaw === null
      ? shop.platformShareBasis
      : clamp(platformShareBasisRaw, 0, 10000)

    const nextBarber = barberShareBasisRaw === null
      ? shop.barberShareBasis
      : clamp(barberShareBasisRaw, 0, 10000)

    const updated = await prisma.shop.update({
      where: { id: shopId },
      data: {
        platformShareBasis: nextPlatform,
        barberShareBasis: nextBarber,
      },
      select: {
        id: true,
        name: true,
        platformShareBasis: true,
        barberShareBasis: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ ok: true, shop: updated })
  } catch (e: any) {
    console.error('[admin/shops/update-billing] error:', e)
    return NextResponse.json(
      { ok: false, error: '更新失败', detail: e?.message ?? null, code: e?.code ?? null },
      { status: 500 },
    )
  }
}
