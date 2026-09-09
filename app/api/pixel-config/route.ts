import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } })
}

/** Config publica que o t.js usa pra detectar clique de checkout/lead. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({}, { headers: CORS })

  await initDb()
  const r = await db.execute({
    sql: `SELECT ic_detection_type, ic_detection_value, send_initiate_checkout,
                 lead_detection_value, send_lead,
                 atc_detection_type, atc_detection_value, send_add_to_cart, allowed_domain
          FROM pixels WHERE dashboard_id = ? AND enabled = 1 LIMIT 1`,
    args: [id],
  })
  const p: any = r.rows[0]
  if (!p) return NextResponse.json({}, { headers: CORS })

  return NextResponse.json(
    {
      initiateCheckout: p.send_initiate_checkout ? { type: p.ic_detection_type, value: p.ic_detection_value } : null,
      lead: p.send_lead ? { type: 'button_text_match', value: p.lead_detection_value } : null,
      addToCart: p.send_add_to_cart ? { type: p.atc_detection_type, value: p.atc_detection_value } : null,
      allowedDomain: p.allowed_domain || null,
    },
    { headers: CORS }
  )
}
