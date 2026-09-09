import { NextRequest, NextResponse } from 'next/server'
import { flushCapiQueue } from '@/lib/capi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }
  return NextResponse.json(await flushCapiQueue(200))
}
