import { db, initDb } from './db'
import { getRate } from './fx'

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
  results?: { indicator?: string; values?: { value?: string }[] }[]
}

async function graph<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`Meta API: ${json?.error?.message || res.status}`)
  }
  return json as T
}

/** "Resultados" do Gerenciador: a Meta ja escolhe o evento pelo objetivo do conjunto. */
function resultCount(results: InsightRow['results']): number {
  return (results || []).reduce((sum, r) => sum + Number(r.values?.[0]?.value || 0), 0)
}

/**
 * time_increment=1 com level=ad num periodo longo (meses/anos) estoura com
 * "An unknown error occurred" (subcode 99) -- a Meta simplesmente nao devolve
 * tanta linha de uma vez. Corta em janelas de 90 dias, que e o tamanho que
 * comprovadamente funciona.
 */
function chunkRange(since: string, until: string, maxDays = 90): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = []
  let start = new Date(`${since}T00:00:00Z`)
  const end = new Date(`${until}T00:00:00Z`)
  while (start <= end) {
    const stop = new Date(Math.min(start.getTime() + (maxDays - 1) * 864e5, end.getTime()))
    out.push({ since: start.toISOString().slice(0, 10), until: stop.toISOString().slice(0, 10) })
    start = new Date(stop.getTime() + 864e5)
  }
  return out
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
  currency?: string | null      // moeda da conta de anuncio
  baseCurrency?: string | null  // moeda do dashboard
}) {
  await initDb()
  const { dashboardId, accountId, accessToken, since, until } = opts
  const currency = opts.currency || null
  const baseCurrency = opts.baseCurrency || null

  const fields = [
    'spend', 'impressions', 'clicks', 'inline_link_clicks', 'reach', 'results',
    'account_id', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  ].join(',')

  let rows = 0
  const seenObjects = new Map<string, { level: string; id: string; name: string; campaignId?: string; adsetId?: string }>()

  for (const win of chunkRange(since, until)) {
    let url =
      `${GRAPH}/act_${accountId}/insights?level=ad&fields=${fields}` +
      `&time_range=${encodeURIComponent(JSON.stringify(win))}` +
      `&time_increment=1&limit=500&access_token=${encodeURIComponent(accessToken)}`

    while (url) {
      const page = await graph<{ data: InsightRow[]; paging?: { next?: string } }>(url)

      for (const r of page.data || []) {
        if (!r.ad_id) continue
        // Gasto entra sempre na moeda do dashboard: e ela que o resto do app soma.
        const rate = currency && baseCurrency ? await getRate(r.date_start, currency, baseCurrency) : 1
        const cents = Math.round(parseFloat(r.spend || '0') * 100 * rate)

        await db.execute({
          sql: `INSERT INTO ad_insights (dashboard_id, platform, date, account_id, campaign_id, adset_id, ad_id,
                                         spend_cents, impressions, clicks, link_clicks, reach, results, currency, fx_rate, updated_at)
                VALUES (?, 'meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT (dashboard_id, platform, ad_id, date) DO UPDATE SET
                  spend_cents = excluded.spend_cents,
                  impressions = excluded.impressions,
                  clicks      = excluded.clicks,
                  link_clicks = excluded.link_clicks,
                  reach       = excluded.reach,
                  results     = excluded.results,
                  currency    = excluded.currency,
                  fx_rate     = excluded.fx_rate,
                  updated_at  = datetime('now')`,
          args: [
            dashboardId, r.date_start, accountId, r.campaign_id ?? null, r.adset_id ?? null, r.ad_id,
            cents, Number(r.impressions || 0), Number(r.clicks || 0), Number(r.inline_link_clicks || 0), Number(r.reach || 0),
            resultCount(r.results), currency, rate,
          ],
        })
        rows++

        if (r.campaign_id) seenObjects.set(`campaign:${r.campaign_id}`, { level: 'campaign', id: r.campaign_id, name: r.campaign_name || r.campaign_id })
        if (r.adset_id) seenObjects.set(`adset:${r.adset_id}`, { level: 'adset', id: r.adset_id, name: r.adset_name || r.adset_id, campaignId: r.campaign_id })
        seenObjects.set(`ad:${r.ad_id}`, { level: 'ad', id: r.ad_id, name: r.ad_name || r.ad_id, campaignId: r.campaign_id, adsetId: r.adset_id })
      }

      url = page.paging?.next || ''
    }
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
