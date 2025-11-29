// 调试版 /api/bookings 接口，不连数据库
import { NextRequest, NextResponse } from 'next/server'

// 非常简单的 GET：永远返回一个固定 JSON
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      from: 'debug GET /api/bookings',
      ts: new Date().toISOString(),
    },
    { status: 200 }
  )
}

// 非常简单的 POST：把你发来的数据原样返回
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return NextResponse.json(
      {
        ok: true,
        from: 'debug POST /api/bookings',
        received: body,
      },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'parse error',
      },
      { status: 400 }
    )
  }
}
