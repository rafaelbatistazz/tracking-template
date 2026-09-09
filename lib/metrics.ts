import { db, initDb } from './db'

export type Range = {
  /** ISO UTC, ja convertido a partir da data local do dashboard. */
  fromUtc: string
  toUtc: string
  /** YYYY-MM-DD no fuso do dashboard (usado no gasto, que ja vem por dia local). */
  fromLocal: string
  toLocal: string
}

/** Converte "2026-09-01".."2026-09-09" no fuso do dashboard para uma janela UTC. */
export function buildRange(fromLocal: string, toLocal: string, tzOffset: number): Range {
  const sign = tzOffset <= 0 ? '+' : '-'
  const abs = String(Math.abs(tzOffset)).padStart(2, '0')
  // Data local -> instante UTC. Ex: 2026-09-01T00:00:00-03:00
  const off = `${tzOffset < 0 ? '-' : '+'}${abs}:00`
  return {
    fromUtc: new Date(`${fromLocal}T00:00:00${off}`).toISOString(),
    toUtc: new Date(`${toLocal}T23:59:59.999${off}`).toISOString(),
    fromLocal,
    toLocal,
  }
  void sign
}

export type Filters = {
  productNames?: string[] | null
  platforms?: string[] | null
  trafficSource?: string | null
  adAccountIds?: string[] | null
}

function filterSql(filters: Filters, args: any[]): string {
  let sql = ''
  if (filters.platforms?.length) {
    sql += ` AND o.platform IN (${filters.platforms.map(() => '?').join(',')})`
    args.push(...filters.platforms)
  }
  if (filters.trafficSource) {
    sql += ` AND o.traffic_source = ?`
    args.push(filters.trafficSource)
  }
  if (filters.adAccountIds?.length) {
    sql += ` AND o.account_id IN (${filters.adAccountIds.map(() => '?').join(',')})`
    args.push(...filters.adAccountIds)
  }
  if (filters.productNames?.length) {
    sql += ` AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.product_name IN (${filters.productNames
      .map(() => '?')
      .join(',')}))`
    args.push(...filters.productNames)
  }
  return sql
}

const APPROVED = `o.status = 'paid'`
const PENDING = `o.status = 'waiting_payment'`

export type Summary = Awaited<ReturnType<typeof getSummary>>

export async function getSummary(dashboardId: string, range: Range, filters: Filters = {}) {
  await initDb()

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  const where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)

  const totals = await db.execute({
    sql: `SELECT
            COUNT(*)                                                    AS total,
            SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)                AS approved,
            SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)                 AS pending,
            SUM(CASE WHEN o.status = 'refused' THEN 1 ELSE 0 END)       AS refused,
            SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)      AS refunded,
            SUM(CASE WHEN o.status = 'chargedback' THEN 1 ELSE 0 END)   AS chargedback,
            SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)      AS net_revenue,
            SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)    AS gross_revenue,
            SUM(CASE WHEN ${PENDING} THEN o.net_cents ELSE 0 END)       AS pending_revenue,
            SUM(CASE WHEN ${APPROVED} THEN o.cost_cents ELSE 0 END)     AS cost,
            SUM(CASE WHEN ${APPROVED} THEN o.tax_cents ELSE 0 END)      AS tax,
            SUM(CASE WHEN o.payment_method = 'credit_card' THEN 1 ELSE 0 END)                         AS cc_total,
            SUM(CASE WHEN o.payment_method = 'credit_card' AND ${APPROVED} THEN 1 ELSE 0 END)         AS cc_approved,
            SUM(CASE WHEN o.payment_method = 'credit_card' AND o.status = 'refused' THEN 1 ELSE 0 END) AS cc_refused
          FROM orders o WHERE ${where}`,
    args,
  })
  const t: any = totals.rows[0] ?? {}
  const n = (v: any) => Number(v || 0)

  const spendArgs: any[] = [dashboardId, range.fromLocal, range.toLocal]
  let spendWhere = `dashboard_id = ? AND date BETWEEN ? AND ?`
  if (filters.adAccountIds?.length) {
    spendWhere += ` AND account_id IN (${filters.adAccountIds.map(() => '?').join(',')})`
    spendArgs.push(...filters.adAccountIds)
  }
  if (filters.trafficSource) {
    spendWhere += ` AND platform = ?`
    spendArgs.push(filters.trafficSource)
  }
  const spendRow = await db.execute({
    sql: `SELECT SUM(spend_cents) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks
          FROM ad_insights WHERE ${spendWhere}`,
    args: spendArgs,
  })
  const s: any = spendRow.rows[0] ?? {}

  const expenses = await db.execute({
    sql: `SELECT SUM(amount_cents) AS total FROM expenses WHERE dashboard_id = ? AND (date IS NULL OR date BETWEEN ? AND ?)`,
    args: [dashboardId, range.fromLocal, range.toLocal],
  })

  const netRevenue = n(t.net_revenue)
  const spend = n(s.spend)
  const cost = n(t.cost)
  const tax = n(t.tax)
  const otherExpenses = n((expenses.rows[0] as any)?.total)
  const profit = netRevenue - spend - cost - tax - otherExpenses

  const approved = n(t.approved)
  const pending = n(t.pending)
  const total = n(t.total)

  // Series por hora e por dia, ja no fuso do dashboard.
  const byDay = await db.execute({
    sql: `SELECT substr(o.created_at, 1, 10) AS day,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)           AS sales
          FROM orders o WHERE ${where} GROUP BY day ORDER BY day`,
    args: [...args],
  })

  const byHour = await db.execute({
    sql: `SELECT CAST(substr(o.created_at, 12, 2) AS INTEGER) AS hour,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)           AS sales
          FROM orders o WHERE ${where} GROUP BY hour ORDER BY hour`,
    args: [...args],
  })

  const byProduct = await db.execute({
    sql: `SELECT i.product_name AS name,
                 COUNT(DISTINCT o.id)                                     AS sales,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)   AS revenue
          FROM orders o JOIN order_items i ON i.order_id = o.id
          WHERE ${where} AND ${APPROVED}
          GROUP BY i.product_name ORDER BY revenue DESC LIMIT 20`,
    args: [...args],
  })

  const byPaymentMethod = await db.execute({
    sql: `SELECT COALESCE(o.payment_method, 'outro') AS method,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END) AS sales,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue
          FROM orders o WHERE ${where} GROUP BY method ORDER BY revenue DESC`,
    args: [...args],
  })

  const bySource = await db.execute({
    sql: `SELECT COALESCE(o.traffic_source, 'organic') AS source,
                 COUNT(*) AS orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END) AS revenue
          FROM orders o WHERE ${where} GROUP BY source ORDER BY revenue DESC`,
    args: [...args],
  })

  const untracked = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM orders o WHERE ${where} AND ${APPROVED} AND o.ad_id IS NULL AND o.campaign_id IS NULL`,
    args: [...args],
  })

  return {
    revenue: netRevenue,
    grossRevenue: n(t.gross_revenue),
    pendingRevenue: n(t.pending_revenue),
    spend,
    cost,
    tax,
    otherExpenses,
    profit,
    roas: spend > 0 ? netRevenue / spend : null,
    roi: spend > 0 ? profit / spend : null,
    margin: netRevenue > 0 ? profit / netRevenue : null,
    ordersCount: {
      total,
      approved,
      pending,
      refused: n(t.refused),
      refunded: n(t.refunded),
      chargedback: n(t.chargedback),
      creditCardTotal: n(t.cc_total),
      creditCardApproved: n(t.cc_approved),
      creditCardRefused: n(t.cc_refused),
    },
    averageTicket: approved > 0 ? Math.round(netRevenue / approved) : 0,
    cpa: approved > 0 && spend > 0 ? Math.round(spend / approved) : null,
    cpt: total > 0 && spend > 0 ? Math.round(spend / total) : null,
    cpp: pending > 0 && spend > 0 ? Math.round(spend / pending) : null,
    approvalRate: n(t.cc_total) > 0 ? n(t.cc_approved) / n(t.cc_total) : null,
    impressions: n(s.impressions),
    clicks: n(s.clicks),
    linkClicks: n(s.link_clicks),
    cpm: n(s.impressions) > 0 ? Math.round((spend / n(s.impressions)) * 1000) : null,
    cpc: n(s.clicks) > 0 ? Math.round(spend / n(s.clicks)) : null,
    ctr: n(s.impressions) > 0 ? n(s.clicks) / n(s.impressions) : null,
    untrackedApproved: n((untracked.rows[0] as any)?.c),
    byDay: byDay.rows as any[],
    byHour: byHour.rows as any[],
    byProduct: byProduct.rows as any[],
    byPaymentMethod: byPaymentMethod.rows as any[],
    bySource: bySource.rows as any[],
  }
}

const UTM_COLUMNS: Record<string, string> = {
  src: 'o.src',
  utmSource: 'o.utm_source',
  utmCampaign: 'o.utm_campaign',
  utmMedium: 'o.utm_medium',
  utmContent: 'o.utm_content',
  utmTerm: 'o.utm_term',
}

/** Tabela da aba UTMs: agrupa vendas por um dos parametros e cola o gasto por cima. */
export async function getByUtm(dashboardId: string, groupBy: string, range: Range, filters: Filters = {}) {
  await initDb()
  const col = UTM_COLUMNS[groupBy]
  if (!col) throw new Error('Agrupamento invalido')

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  const where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)

  // O id do objeto de anuncio sai do proprio valor da UTM ("nome|id"),
  // e e por ele que casamos com o gasto.
  const idExpr =
    groupBy === 'utmCampaign' ? 'o.campaign_id' : groupBy === 'utmMedium' ? 'o.adset_id' : groupBy === 'utmContent' ? 'o.ad_id' : 'NULL'

  const rows = await db.execute({
    sql: `SELECT COALESCE(${col}, '(vazio)') AS value,
                 ${idExpr} AS object_id,
                 COUNT(*)                                                  AS total_orders,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)              AS approved_orders,
                 SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)               AS pending_orders,
                 SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)    AS refunded_orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)    AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)  AS gross_revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.cost_cents + o.tax_cents ELSE 0 END) AS cost
          FROM orders o WHERE ${where}
          GROUP BY value, object_id
          ORDER BY revenue DESC`,
    args,
  })

  const spendRows = await db.execute({
    sql: `SELECT ${groupBy === 'utmCampaign' ? 'campaign_id' : groupBy === 'utmMedium' ? 'adset_id' : 'ad_id'} AS object_id,
                 SUM(spend_cents) AS spend, SUM(impressions) AS impressions, SUM(clicks) AS clicks
          FROM ad_insights WHERE dashboard_id = ? AND date BETWEEN ? AND ? GROUP BY object_id`,
    args: [dashboardId, range.fromLocal, range.toLocal],
  })
  const spendBy = new Map<string, any>()
  for (const r of spendRows.rows as any[]) if (r.object_id) spendBy.set(String(r.object_id), r)

  return (rows.rows as any[]).map((r) => {
    const sp = r.object_id ? spendBy.get(String(r.object_id)) : null
    return decorate(r, sp)
  })
}

/** Tabela da aba de anuncios: hierarquia conta > campanha > conjunto > anuncio. */
export async function getAdObjects(dashboardId: string, level: 'account' | 'campaign' | 'adset' | 'ad', range: Range, filters: Filters = {}) {
  await initDb()
  const col = { account: 'account_id', campaign: 'campaign_id', adset: 'adset_id', ad: 'ad_id' }[level]

  const args: any[] = [dashboardId, range.fromUtc, range.toUtc]
  const where = `o.dashboard_id = ? AND o.created_at BETWEEN ? AND ?` + filterSql(filters, args)

  const salesRows = await db.execute({
    sql: `SELECT o.${col} AS object_id,
                 COUNT(*)                                                  AS total_orders,
                 SUM(CASE WHEN ${APPROVED} THEN 1 ELSE 0 END)              AS approved_orders,
                 SUM(CASE WHEN ${PENDING} THEN 1 ELSE 0 END)               AS pending_orders,
                 SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END)    AS refunded_orders,
                 SUM(CASE WHEN ${APPROVED} THEN o.net_cents ELSE 0 END)    AS revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.gross_cents ELSE 0 END)  AS gross_revenue,
                 SUM(CASE WHEN ${APPROVED} THEN o.cost_cents + o.tax_cents ELSE 0 END) AS cost
          FROM orders o WHERE ${where} AND o.${col} IS NOT NULL
          GROUP BY object_id`,
    args,
  })
  const salesBy = new Map<string, any>()
  for (const r of salesRows.rows as any[]) salesBy.set(String(r.object_id), r)

  const spendRows = await db.execute({
    sql: `SELECT ${col} AS object_id, SUM(spend_cents) AS spend, SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks
          FROM ad_insights WHERE dashboard_id = ? AND date BETWEEN ? AND ? AND ${col} IS NOT NULL
          GROUP BY object_id`,
    args: [dashboardId, range.fromLocal, range.toLocal],
  })

  const names = await db.execute({
    sql: `SELECT object_id, name, status, effective_status, account_id, campaign_id, adset_id
          FROM ad_objects WHERE dashboard_id = ? AND level = ?`,
    args: [dashboardId, level],
  })
  const nameBy = new Map<string, any>()
  for (const r of names.rows as any[]) nameBy.set(String(r.object_id), r)

  const ids = new Set<string>([
    ...Array.from(salesBy.keys()),
    ...(spendRows.rows as any[]).map((r) => String(r.object_id)),
  ])
  const spendBy = new Map<string, any>()
  for (const r of spendRows.rows as any[]) spendBy.set(String(r.object_id), r)

  return Array.from(ids)
    .map((id) => {
      const meta = nameBy.get(id)
      return {
        id,
        level,
        name: meta?.name ?? `(${level} ${id})`,
        status: meta?.effective_status ?? meta?.status ?? null,
        accountId: meta?.account_id ?? null,
        campaignId: meta?.campaign_id ?? null,
        adsetId: meta?.adset_id ?? null,
        ...decorate(salesBy.get(id) ?? {}, spendBy.get(id)),
      }
    })
    .sort((a, b) => b.profit - a.profit)
}

function decorate(sales: any, spendRow: any) {
  const n = (v: any) => Number(v || 0)
  const revenue = n(sales.revenue)
  const spend = n(spendRow?.spend)
  const cost = n(sales.cost)
  const approved = n(sales.approved_orders)
  const pending = n(sales.pending_orders)
  const total = n(sales.total_orders)
  const profit = revenue - spend - cost
  const impressions = n(spendRow?.impressions)
  const clicks = n(spendRow?.clicks)

  return {
    value: sales.value ?? null,
    objectId: sales.object_id ?? null,
    revenue,
    grossRevenue: n(sales.gross_revenue),
    spend,
    cost,
    profit,
    totalOrders: total,
    approvedOrders: approved,
    pendingOrders: pending,
    refundedOrders: n(sales.refunded_orders),
    roas: spend > 0 ? revenue / spend : null,
    roi: spend > 0 ? profit / spend : null,
    margin: revenue > 0 ? profit / revenue : null,
    cpa: approved > 0 && spend > 0 ? Math.round(spend / approved) : null,
    cpt: total > 0 && spend > 0 ? Math.round(spend / total) : null,
    cpp: pending > 0 && spend > 0 ? Math.round(spend / pending) : null,
    averageTicket: approved > 0 ? Math.round(revenue / approved) : 0,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpm: impressions > 0 ? Math.round((spend / impressions) * 1000) : null,
    cpc: clicks > 0 ? Math.round(spend / clicks) : null,
  }
}
