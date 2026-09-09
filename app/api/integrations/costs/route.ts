import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const costs = await db.execute({ sql: `SELECT * FROM product_costs WHERE dashboard_id = ?`, args: [dashboardId] })
    const products = await db.execute({
      sql: `SELECT DISTINCT product_name FROM order_items WHERE dashboard_id = ? ORDER BY product_name`,
      args: [dashboardId],
    })
    return NextResponse.json({ costs: costs.rows, products: (products.rows as any[]).map((p) => p.product_name) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dashboardId, productName, costCents, taxPercent, applyToExisting } = await req.json()
    await initDb()
    await db.execute({
      sql: `INSERT INTO product_costs (dashboard_id, product_name, cost_cents, tax_percent) VALUES (?,?,?,?)
            ON CONFLICT (dashboard_id, product_name) DO UPDATE SET cost_cents = excluded.cost_cents, tax_percent = excluded.tax_percent`,
      args: [dashboardId, productName, Math.round(costCents || 0), Number(taxPercent || 0)],
    })

    // Recalcula pedidos ja gravados, senao o custo so vale daqui pra frente.
    if (applyToExisting) {
      await db.execute({
        sql: `UPDATE orders SET
                cost_cents = ?,
                tax_cents = CAST(net_cents * ? / 100 AS INTEGER)
              WHERE dashboard_id = ?
                AND id IN (SELECT order_id FROM order_items WHERE dashboard_id = ? AND product_name = ?)`,
        args: [Math.round(costCents || 0), Number(taxPercent || 0), dashboardId, dashboardId, productName],
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
