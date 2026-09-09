import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { syncMetaInsights, syncMetaStatuses } from '@/lib/meta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Sincroniza gasto da Meta pra todas as contas habilitadas.
 * Reprocessa os ultimos N dias porque a Meta ainda mexe no gasto retroativo.
 *
 *   GET /api/cron/sync-meta?days=7   (header: x-cron-secret)
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'nao autorizado' }, { status: 401 })
  }

  await initDb()
  const days = Math.min(Number(req.nextUrl.searchParams.get('days') || 3), 90)
  const accounts = await db.execute({
    sql: `SELECT a.*, d.tz_offset FROM ad_accounts a JOIN dashboards d ON d.id = a.dashboard_id
          WHERE a.enabled = 1 AND a.platform = 'meta'`,
    args: [],
  })

  const results: any[] = []
  for (const a of accounts.rows as any[]) {
    const tz = Number(a.tz_offset ?? -3)
    const now = new Date(Date.now() + tz * 3600 * 1000)
    const until = now.toISOString().slice(0, 10)
    const since = new Date(now.getTime() - (days - 1) * 864e5).toISOString().slice(0, 10)

    try {
      const token = a.access_token || process.env.META_ACCESS_TOKEN
      if (!token) throw new Error('sem token')
      const r = await syncMetaInsights({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token, since, until })
      const statuses = await syncMetaStatuses({ dashboardId: a.dashboard_id, accountId: a.account_id, accessToken: token })
      results.push({ account: a.account_id, ...r, statuses })
    } catch (e: any) {
      results.push({ account: a.account_id, error: e?.message || 'falha' })
    }
  }

  return NextResponse.json({ ok: true, accounts: accounts.rows.length, results })
}
