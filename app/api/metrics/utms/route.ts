import { NextRequest, NextResponse } from 'next/server'
import { getByUtm } from '@/lib/metrics'
import { errorResponse, readContext } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { dashboardId, range, filters, currency } = await readContext(req)
    const groupBy = req.nextUrl.searchParams.get('groupBy') || 'utmCampaign'
    return NextResponse.json({ currency, groupBy, results: await getByUtm(dashboardId, groupBy, range, filters) })
  } catch (e) {
    return errorResponse(e)
  }
}
