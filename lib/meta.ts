import { db, initDb } from './db'

const VERSION = process.env.META_API_VERSION || 'v21.0'
const GRAPH = `https://graph.facebook.com/${VERSION}`

type InsightRow = {
  date_start: string
  spend?: string
  impressions?: string
  clicks?: string
  inline_link_clicks?: string
  reach?: string
  account_id?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
}

async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`Meta API: ${json?.error?.message || res.status}`)
  }
  return json as T
}

/**
 * Puxa gasto por anuncio e por dia. time_increment=1 e o que permite recortar
 * qualquer periodo depois sem pedir de novo pra API.
 */
export async function syncMetaInsights(opts: {
  dashboardId: string
  accountId: string
  accessToken: string
  since: string // YYYY-MM-DD
  until: string
}) {
  await initDb()
  const { dashboardId, accountId, accessToken, since, until } = opts

  const fields = [
    'spend', 'impressions', 'clicks', 'inline_link_clicks', 'reach',
    'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  ].join(',')

  let url =
    `${GRAPH}/act_${accountId}/insights?level=ad&fields=${fields}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&time_increment=1&limit=500&access_token=${encodeURIComponent(accessToken)}`

  let rows = 0
  const seenObjects = new Map<string, { level: string; id: string; name: string; campaignId?: string; adsetId?: string }>()

  while (url) {
    const page = await graph<{ data: InsightRow[]; paging?: { next?: string } }>(url)

    for (const r of page.data || []) {
      if (!r.ad_id) continue
      const cents = Math.round(parseFloat(r.spend || '0') * 100)

      await db.execute({
        sql: `INSERT INTO ad_insights (dashboard_id, platform, date, account_id, campaign_id, adset_id, ad_id,
                                       spend_cents, impressions, clicks, link_clicks, reach, updated_at)
              VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, ad_id, date) DO UPDATE SET
                spend_cents = excluded.spend_cents,
                impressions = excluded.impressions,
                clicks      = excluded.clicks,
                link_clicks = excluded.link_clicks,
                reach       = excluded.reach,
                updated_at  = datetime('now')`,
        args: [
          dashboardId, r.date_start, accountId, r.campaign_id ?? null, r.adset_id ?? null, r.ad_id,
          cents, Number(r.impressions || 0), Number(r.clicks || 0), Number(r.inline_link_clicks || 0), Number(r.reach || 0),
        ],
      })
      rows++

      if (r.campaign_id) seenObjects.set(`campaign:${r.campaign_id}`, { level: 'campaign', id: r.campaign_id, name: r.campaign_name || r.campaign_id })
      if (r.adset_id) seenObjects.set(`adset:${r.adset_id}`, { level: 'adset', id: r.adset_id, name: r.adset_name || r.adset_id, campaignId: r.campaign_id })
      seenObjects.set(`ad:${r.ad_id}`, { level: 'ad', id: r.ad_id, name: r.ad_name || r.ad_id, campaignId: r.campaign_id, adsetId: r.adset_id })
    }

    url = page.paging?.next || ''
  }

  for (const o of seenObjects.values()) {
    await db.execute({
      sql: `INSERT INTO ad_objects (dashboard_id, platform, level, object_id, account_id, campaign_id, adset_id, ad_id, name, updated_at)
            VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
              name = excluded.name, campaign_id = excluded.campaign_id, adset_id = excluded.adset_id,
              updated_at = datetime('now')`,
      args: [
        dashboardId, o.level, o.id, accountId, o.campaignId ?? null, o.adsetId ?? null,
        o.level === 'ad' ? o.id : null, o.name,
      ],
    })
  }

  return { insightRows: rows, objects: seenObjects.size }
}

/** Status atual (ativo/pausado) dos anuncios - a API de insights nao devolve isso. */
export async function syncMetaStatuses(opts: { dashboardId: string; accountId: string; accessToken: string }) {
  const { dashboardId, accountId, accessToken } = opts
  let url = `${GRAPH}/act_${accountId}/ads?fields=id,name,status,effective_status,adset_id,campaign_id&limit=500&access_token=${encodeURIComponent(accessToken)}`
  let count = 0
  while (url) {
    const page = await graph<{ data: any[]; paging?: { next?: string } }>(url)
    for (const ad of page.data || []) {
      await db.execute({
        sql: `INSERT INTO ad_objects (dashboard_id, platform, level, object_id, account_id, campaign_id, adset_id, ad_id, name, status, effective_status, updated_at)
              VALUES (?, 'meta', 'ad', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT (dashboard_id, platform, level, object_id) DO UPDATE SET
                name = excluded.name, status = excluded.status, effective_status = excluded.effective_status,
                updated_at = datetime('now')`,
        args: [dashboardId, ad.id, accountId, ad.campaign_id ?? null, ad.adset_id ?? null, ad.id, ad.name, ad.status, ad.effective_status],
      })
      count++
    }
    url = page.paging?.next || ''
  }
  return count
}

/** Lista as contas de anuncio do token, pra tela de integracao. */
export async function listMetaAdAccounts(accessToken: string) {
  const json = await graph<{ data: any[] }>(
    `${GRAPH}/me/adaccounts?fields=account_id,name,currency,account_status&limit=200&access_token=${encodeURIComponent(accessToken)}`
  )
  return (json.data || []).map((a) => ({
    accountId: String(a.account_id),
    name: a.name as string,
    currency: a.currency as string,
    active: a.account_status === 1,
  }))
}
