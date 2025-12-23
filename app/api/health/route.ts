
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const revalidate = 0

// GET /api/health

export async function GET() {

  const res = NextResponse.json(

    {

      ok: true,

      service: 'barberflow-backend',

      ts: new Date().toISOString(),

    },

    { status: 200 }

  )

  res.headers.set('Cache-Control', 'no-store')

  return res

}

// 兼容某些探活用 POST

export async function POST() {

  return GET()

}

