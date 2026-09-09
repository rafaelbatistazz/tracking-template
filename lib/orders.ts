import { db, initDb, newId } from './db'
import { parseAdRef, type Utms } from './utm'
import type { NormalizedOrder } from './adapters'

/**
 * Grava (ou atualiza) um pedido vindo do webhook, ja resolvendo a atribuicao.
 *
 * Ordem de resolucao das UTMs, da mais confiavel pra menos:
 *   1. o que o gateway mandou no webhook;
 *   2. a visita gravada pelo script (casada pelo rt_vid), quando o gateway
 *      engoliu as UTMs -- e o caso mais comum de venda "nao trackeada";
 *   3. nada: o pedido fica como organico.
 */
export async function ingestOrder(dashboardId: string, platform: string, order: NormalizedOrder, raw: unknown) {
  await initDb()

  let utms: Utms = order.utms || {}
  let clickIds = order.clickIds || {}

  const empty = !utms.utm_campaign && !utms.utm_content && !utms.utm_source && !utms.src
  if (empty && order.visitorId) {
    const v = await db.execute({
      sql: `SELECT src, sck, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ttclid
            FROM visits WHERE dashboard_id = ? AND visitor_id = ?
            ORDER BY created_at DESC LIMIT 1`,
      args: [dashboardId, order.visitorId],
    })
    const row: any = v.rows[0]
    if (row) {
      utms = {
        src: row.src,
        sck: row.sck,
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        utm_campaign: row.utm_campaign,
        utm_content: row.utm_content,
        utm_term: row.utm_term,
      }
      clickIds = { fbclid: row.fbclid, gclid: row.gclid, ttclid: row.ttclid }
    }
  }

  const ref = parseAdRef(utms, clickIds)

  // Se so veio o id do anuncio, completa conjunto/campanha/conta pela hierarquia.
  let { accountId, campaignId, adsetId, adId } = ref
  if (adId) {
    const r = await db.execute({
      sql: `SELECT account_id, campaign_id, adset_id FROM ad_objects
            WHERE dashboard_id = ? AND level = 'ad' AND object_id = ? LIMIT 1`,
      args: [dashboardId, adId],
    })
    const row: any = r.rows[0]
    if (row) {
      accountId = accountId || row.account_id
      campaignId = campaignId || row.campaign_id
      adsetId = adsetId || row.adset_id
    }
  } else if (campaignId) {
    const r = await db.execute({
      sql: `SELECT account_id FROM ad_objects WHERE dashboard_id = ? AND level = 'campaign' AND object_id = ? LIMIT 1`,
      args: [dashboardId, campaignId],
    })
    accountId = accountId || ((r.rows[0] as any)?.account_id ?? null)
  }

  // Custo do produto e imposto cadastrados na aba de custos.
  const productName = order.items[0]?.productName ?? null
  let costCents = 0
  let taxCents = 0
  if (productName) {
    const c = await db.execute({
      sql: `SELECT cost_cents, tax_percent FROM product_costs WHERE dashboard_id = ? AND product_name = ?`,
      args: [dashboardId, productName],
    })
    const row: any = c.rows[0]
    if (row) {
      costCents = Number(row.cost_cents) || 0
      taxCents = Math.round((order.netCents * (Number(row.tax_percent) || 0)) / 100)
    }
  }

  const id = newId()
  await db.execute({
    sql: `INSERT INTO orders (
            id, dashboard_id, platform, external_id, status, payment_method, installments, is_recurring, sale_type,
            customer_name, customer_email, customer_phone, customer_doc, customer_country, customer_ip,
            currency, gross_cents, net_cents, gateway_fee_cents, tax_cents, cost_cents,
            src, sck, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
            traffic_source, account_id, campaign_id, adset_id, ad_id, visitor_id,
            created_at, approved_at, refunded_at, updated_at, raw
          ) VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?, datetime('now'), ?)
          ON CONFLICT (dashboard_id, platform, external_id) DO UPDATE SET
            status = excluded.status,
            payment_method = COALESCE(excluded.payment_method, orders.payment_method),
            gross_cents = excluded.gross_cents,
            net_cents = excluded.net_cents,
            tax_cents = excluded.tax_cents,
            cost_cents = excluded.cost_cents,
            approved_at = COALESCE(excluded.approved_at, orders.approved_at),
            refunded_at = COALESCE(excluded.refunded_at, orders.refunded_at),
            -- so preenche atribuicao se ainda estiver vazia: o primeiro webhook
            -- (pix gerado) costuma trazer as UTMs, o de aprovacao nem sempre.
            src          = COALESCE(orders.src, excluded.src),
            sck          = COALESCE(orders.sck, excluded.sck),
            utm_source   = COALESCE(orders.utm_source, excluded.utm_source),
            utm_medium   = COALESCE(orders.utm_medium, excluded.utm_medium),
            utm_campaign = COALESCE(orders.utm_campaign, excluded.utm_campaign),
            utm_content  = COALESCE(orders.utm_content, excluded.utm_content),
            utm_term     = COALESCE(orders.utm_term, excluded.utm_term),
            traffic_source = COALESCE(orders.traffic_source, excluded.traffic_source),
            account_id   = COALESCE(orders.account_id, excluded.account_id),
            campaign_id  = COALESCE(orders.campaign_id, excluded.campaign_id),
            adset_id     = COALESCE(orders.adset_id, excluded.adset_id),
            ad_id        = COALESCE(orders.ad_id, excluded.ad_id),
            visitor_id   = COALESCE(orders.visitor_id, excluded.visitor_id),
            updated_at   = datetime('now'),
            raw          = excluded.raw`,
    args: [
      id, dashboardId, platform, order.externalId, order.status, order.paymentMethod ?? null, order.installments ?? null,
      order.isRecurring ? 1 : 0, order.saleType ?? 'producer',
      order.customerName ?? null, order.customerEmail ?? null, order.customerPhone ?? null, order.customerDoc ?? null,
      order.customerCountry ?? null, order.customerIp ?? null,
      order.currency ?? 'BRL', order.grossCents, order.netCents, order.gatewayFeeCents ?? 0, taxCents, costCents,
      utms.src ?? null, utms.sck ?? null, utms.utm_source ?? null, utms.utm_medium ?? null,
      utms.utm_campaign ?? null, utms.utm_content ?? null, utms.utm_term ?? null,
      ref.trafficSource, accountId, campaignId, adsetId, adId, order.visitorId ?? null,
      order.createdAt, order.approvedAt ?? null, order.refundedAt ?? null,
      JSON.stringify(raw).slice(0, 20000),
    ],
  })

  // Pega o id real (pode ser um update de pedido que ja existia).
  const found = await db.execute({
    sql: `SELECT id FROM orders WHERE dashboard_id = ? AND platform = ? AND external_id = ?`,
    args: [dashboardId, platform, order.externalId],
  })
  const orderId = String((found.rows[0] as any).id)

  await db.execute({ sql: `DELETE FROM order_items WHERE order_id = ?`, args: [orderId] })
  for (const item of order.items) {
    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, dashboard_id, product_id, product_name, plan_name, quantity, price_cents, is_bump)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        newId(), orderId, dashboardId, item.productId ?? null, item.productName, item.planName ?? null,
        item.quantity ?? 1, item.priceCents ?? 0, item.isBump ? 1 : 0,
      ],
    })
  }

  return { orderId, trafficSource: ref.trafficSource, adId, campaignId }
}
