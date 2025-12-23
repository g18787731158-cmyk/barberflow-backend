
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

export async function GET() {

  const res = NextResponse.json({ ok: true, ts: Date.now() }, { status: 200 })

  res.headers.set('Cache-Control', 'no-store')

  return res

}

