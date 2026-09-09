import { NextRequest, NextResponse } from 'next/server'
import { getSummary } from '@/lib/metrics'
import { errorResponse, readContext } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { dashboardId, range, filters, currency } = await readContext(req)
    const summary = await getSummary(dashboardId, range, filters)
    return NextResponse.json({ currency, ...summary })
  } catch (e) {
    return errorResponse(e)
  }
}
