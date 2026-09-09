import { createHash } from 'crypto'
import { db, initDb, newId } from './db'

const VERSION = process.env.META_API_VERSION || 'v21.0'

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

export type CapiEvent = {
  eventName: 'Purchase' | 'InitiateCheckout' | 'Lead' | 'AddToCart' | 'PageView' | 'ViewContent'
  eventId: string
  eventTime: number // epoch em segundos
  sourceUrl?: string | null
  valueCents?: number
  currency?: string
  email?: string | null
  phone?: string | null
  firstName?: string | null
  country?: string | null
  ip?: string | null
  userAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  externalId?: string | null
}

/** Enfileira o evento. O envio real acontece no cron, com retry. */
export async function enqueueCapi(dashboardId: string, pixelId: string, event: CapiEvent) {
  await initDb()
  await db.execute({
    sql: `INSERT INTO capi_queue (id, dashboard_id, pixel_id, event_name, payload) VALUES (?,?,?,?,?)`,
    args: [newId(), dashboardId, pixelId, event.eventName, JSON.stringify(event)],
  })
}

function buildPayload(e: CapiEvent, sendIpRule: string) {
  const user: Record<string, unknown> = {}
  if (e.email) user.em = [sha256(e.email)]
  if (e.phone) user.ph = [sha256(e.phone.replace(/\D/g, ''))]
  if (e.firstName) user.fn = [sha256(e.firstName)]
  if (e.country) user.country = [sha256(e.country)]
  if (e.externalId) user.external_id = [sha256(e.externalId)]
  if (e.fbp) user.fbp = e.fbp
  if (e.fbc) user.fbc = e.fbc
  if (e.userAgent) user.client_user_agent = e.userAgent

  if (e.ip && sendIpRule !== 'no_ip') {
    const isV6 = e.ip.includes(':')
    // "so IPv6" existe porque IP de servidor/IPv4 compartilhado polui a atribuicao.
    if (sendIpRule === 'ipv6_fallback_ipv4' || (sendIpRule === 'ipv6_only_no_fallback' && isV6)) {
      user.client_ip_address = e.ip
    }
  }

  const custom: Record<string, unknown> = {}
  if (e.valueCents != null) {
    custom.value = e.valueCents / 100
    custom.currency = e.currency || 'BRL'
  }

  return {
    event_name: e.eventName,
    event_time: e.eventTime,
    event_id: e.eventId, // dedupe com o pixel do navegador
    event_source_url: e.sourceUrl || undefined,
    action_source: 'website',
    user_data: user,
    custom_data: Object.keys(custom).length ? custom : undefined,
  }
}

/** Processa a fila. Chamado pelo cron. */
export async function flushCapiQueue(limit = 100) {
  await initDb()
  const pending = await db.execute({
    sql: `SELECT * FROM capi_queue WHERE status = 'pending' AND attempts < 5 ORDER BY created_at LIMIT ?`,
    args: [limit],
  })

  let sent = 0
  let failed = 0

  for (const row of pending.rows as any[]) {
    const pixel = await db.execute({ sql: `SELECT * FROM pixels WHERE id = ?`, args: [row.pixel_id] })
    const p: any = pixel.rows[0]
    if (!p || !p.enabled) {
      await db.execute({ sql: `UPDATE capi_queue SET status='failed', last_error='pixel inativo' WHERE id = ?`, args: [row.id] })
      continue
    }

    const targets = await db.execute({ sql: `SELECT * FROM pixel_targets WHERE pixel_id = ?`, args: [row.pixel_id] })
    const event: CapiEvent = JSON.parse(row.payload)
    const data = buildPayload(event, p.send_ip_rule)

    let ok = true
    let error = ''
    for (const t of targets.rows as any[]) {
      if (!t.capi_token) continue
      try {
        const res = await fetch(`https://graph.facebook.com/${VERSION}/${t.platform_pixel_id}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [data],
            access_token: t.capi_token,
            ...(t.test_code ? { test_event_code: t.test_code } : {}),
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error) {
          ok = false
          error = json?.error?.message || `HTTP ${res.status}`
        }
      } catch (e: any) {
        ok = false
        error = e?.message || 'falha de rede'
      }
    }

    if (ok) {
      await db.execute({ sql: `UPDATE capi_queue SET status='sent', sent_at=datetime('now') WHERE id = ?`, args: [row.id] })
      sent++
    } else {
      await db.execute({
        sql: `UPDATE capi_queue SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE id = ?`,
        args: [error, row.id],
      })
      failed++
    }
  }

  return { sent, failed, picked: pending.rows.length }
}
