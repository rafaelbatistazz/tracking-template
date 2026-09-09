import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { errorResponse, readContext } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { dashboardId, range, currency } = await readContext(req)
    await initDb()
    const status = req.nextUrl.searchParams.get('status')
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 100), 500)

    const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
    let sql = `SELECT o.id, o.platform, o.external_id, o.status, o.payment_method, o.customer_name, o.customer_email,
                      o.gross_cents, o.net_cents, o.utm_source, o.utm_campaign, o.utm_content, o.traffic_source,
                      o.created_at,
                      (SELECT group_concat(product_name, ' + ') FROM order_items i WHERE i.order_id = o.id) AS products
               FROM orders o
               WHERE o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?`
    if (status) {
      sql += ` AND o.status = ?`
      args.push(status)
    }
    sql += ` ORDER BY o.created_at DESC LIMIT ?`
    args.push(limit)

    const r = await db.execute({ sql, args })
    return NextResponse.json({ currency, orders: r.rows })
  } catch (e) {
    return errorResponse(e)
  }
}
