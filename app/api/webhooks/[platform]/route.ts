import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { normalize } from '@/lib/adapters'
import { ingestOrder } from '@/lib/orders'
import { enqueueCapi } from '@/lib/capi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint que o gateway chama:
 *   POST /api/webhooks/kirvano?id=<id-do-webhook>
 *
 * Responde 200 sempre que o payload for aceito, mesmo se o evento for ignorado
 * (senao o gateway fica reenviando pra sempre).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  const webhookId = req.nextUrl.searchParams.get('id')
  if (!webhookId) return NextResponse.json({ ok: false, error: 'id ausente' }, { status: 400 })

  await initDb()
  const hook = await db.execute({ sql: `SELECT * FROM webhooks WHERE id = ?`, args: [webhookId] })
  const h: any = hook.rows[0]
  if (!h || !h.enabled) return NextResponse.json({ ok: false, error: 'webhook invalido' }, { status: 404 })
  if (h.platform !== platform) return NextResponse.json({ ok: false, error: 'plataforma divergente' }, { status: 400 })

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'json invalido' }, { status: 400 })
  }

  // Alguns gateways mandam um segredo no corpo ou no header.
  if (h.secret) {
    const got = req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || payload?.secret
    if (got !== h.secret) return NextResponse.json({ ok: false, error: 'segredo invalido' }, { status: 401 })
  }

  const order = normalize(platform, payload)
  if (!order) return NextResponse.json({ ok: true, ignored: true })

  const saleType = req.nextUrl.searchParams.get('saleType')
  if (saleType === 'affiliate' || saleType === 'co-producer') order.saleType = saleType
  if (req.nextUrl.searchParams.get('ignoreRecurrence') === 'true' && order.isRecurring) {
    return NextResponse.json({ ok: true, ignored: 'recorrencia' })
  }

  const result = await ingestOrder(h.dashboard_id, platform, order, payload)

  // Purchase server-side pros pixels do dashboard.
  const wantPending = order.status === 'waiting_payment'
  const pixels = await db.execute({
    sql: `SELECT * FROM pixels WHERE dashboard_id = ? AND enabled = 1`,
    args: [h.dashboard_id],
  })
  for (const p of pixels.rows as any[]) {
    const sendsPending = p.send_purchase_type === 'paid_and_pending_sales'
    if (order.status !== 'paid' && !(wantPending && sendsPending)) continue

    const valueCents =
      p.send_value_type === 'no_value' ? undefined : p.send_value_type === 'gross' ? order.grossCents : order.netCents

    await enqueueCapi(h.dashboard_id, String(p.id), {
      eventName: 'Purchase',
      eventId: `${platform}-${order.externalId}`,
      eventTime: Math.floor(new Date(order.approvedAt || order.createdAt).getTime() / 1000),
      valueCents,
      currency: order.currency || 'BRL',
      email: order.customerEmail,
      phone: order.customerPhone,
      firstName: order.customerName?.split(' ')[0] ?? null,
      country: order.customerCountry,
      ip: order.customerIp,
      externalId: order.customerEmail,
    })
  }

  return NextResponse.json({ ok: true, orderId: result.orderId, trafficSource: result.trafficSource })
}

/** GET so pra validacao de endpoint que alguns gateways fazem. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
