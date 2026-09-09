import { NextRequest, NextResponse } from 'next/server'
import { getAdObjects } from '@/lib/metrics'
import { errorResponse, readContext } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { dashboardId, range, filters, currency } = await readContext(req)
    const level = (req.nextUrl.searchParams.get('level') || 'campaign') as 'account' | 'campaign' | 'adset' | 'ad'
    return NextResponse.json({ currency, level, results: await getAdObjects(dashboardId, level, range, filters) })
  } catch (e) {
    return errorResponse(e)
  }
}
