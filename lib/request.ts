import { NextRequest } from 'next/server'
import { dashboardExists, db, initDb } from './db'
import { buildRange, type Filters, type Range } from './metrics'

/** Le dashboardId + periodo + filtros da querystring. */
export async function readContext(req: NextRequest): Promise<{ dashboardId: string; range: Range; filters: Filters; tzOffset: number; currency: string }> {
  const q = req.nextUrl.searchParams
  const dashboardId = q.get('dashboardId') || ''
  if (!dashboardId) throw new Response('dashboardId ausente', { status: 400 })
  if (!(await dashboardExists(dashboardId))) throw new Response('dashboard nao encontrado', { status: 404 })

  await initDb()
  const d = await db.execute({ sql: `SELECT tz_offset, currency FROM dashboards WHERE id = ?`, args: [dashboardId] })
  const row: any = d.rows[0]
  const tzOffset = Number(row?.tz_offset ?? -3)

  const today = new Date(Date.now() + tzOffset * 3600 * 1000).toISOString().slice(0, 10)
  const range = buildRange(q.get('from') || today, q.get('to') || today, tzOffset)

  const list = (k: string) => {
    const v = q.get(k)
    return v ? v.split(',').filter(Boolean) : null
  }

  return {
    dashboardId,
    range,
    tzOffset,
    currency: String(row?.currency ?? 'BRL'),
    filters: {
      productNames: list('products'),
      platforms: list('platforms'),
      adAccountIds: list('accounts'),
      trafficSource: q.get('trafficSource'),
    },
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof Response) return e
  return new Response(JSON.stringify({ error: (e as Error)?.message || 'erro' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
}
