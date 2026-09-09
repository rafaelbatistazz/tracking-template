import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const pixels = await db.execute({ sql: `SELECT * FROM pixels WHERE dashboard_id = ? ORDER BY created_at DESC`, args: [dashboardId] })
    const out = []
    for (const p of pixels.rows as any[]) {
      const t = await db.execute({ sql: `SELECT id, platform_pixel_id, name, test_code FROM pixel_targets WHERE pixel_id = ?`, args: [p.id] })
      out.push({ ...p, targets: t.rows }) // capi_token nunca sai daqui
    }
    return NextResponse.json({ pixels: out })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    await initDb()
    const id = newId()
    await db.execute({
      sql: `INSERT INTO pixels (id, dashboard_id, name, type, send_purchase_type, send_value_type, send_ip_rule,
                                send_initiate_checkout, ic_detection_type, ic_detection_value,
                                send_lead, lead_detection_value, send_add_to_cart, atc_detection_type, atc_detection_value, allowed_domain)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, b.dashboardId, b.name || 'Pixel', b.type || 'Meta',
        b.sendPurchaseType || 'paid_sales_only', b.sendValueType || 'commission', b.sendIpRule || 'ipv6_fallback_ipv4',
        b.sendInitiateCheckout ? 1 : 0, b.icDetectionType ?? null, b.icDetectionValue ?? null,
        b.sendLead ? 1 : 0, b.leadDetectionValue ?? null,
        b.sendAddToCart ? 1 : 0, b.atcDetectionType ?? null, b.atcDetectionValue ?? null,
        b.allowedDomain ?? null,
      ],
    })
    for (const t of b.targets || []) {
      await db.execute({
        sql: `INSERT INTO pixel_targets (id, pixel_id, platform_pixel_id, name, capi_token, test_code) VALUES (?,?,?,?,?,?)`,
        args: [newId(), id, String(t.platformPixelId), t.name ?? null, t.capiToken ?? null, t.testCode ?? null],
      })
    }
    return NextResponse.json({ id })
  } catch (e) {
    return errorResponse(e)
  }
}
