import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId } from '@/lib/db'
import { errorResponse } from '@/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const base = () => process.env.NEXT_PUBLIC_URL || 'http://localhost:3210'

/** As variacoes de URL que o gateway pede (afiliado, co-produtor, recorrencia). */
function urlsFor(platform: string, id: string) {
  const root = `${base()}/api/webhooks/${platform}?id=${id}`
  const urls = [{ title: 'URL padrao', url: root }]
  if (platform === 'kirvano' || platform === 'hotmart' || platform === 'cakto') {
    urls.push(
      { title: 'URL para afiliados', url: `${root}&saleType=affiliate` },
      { title: 'URL para co-produtores', url: `${root}&saleType=co-producer` },
      { title: 'URL ignorando recorrencia', url: `${root}&ignoreRecurrence=true` }
    )
  }
  return urls
}

export async function GET(req: NextRequest) {
  try {
    const dashboardId = req.nextUrl.searchParams.get('dashboardId') || ''
    await initDb()
    const r = await db.execute({
      sql: `SELECT id, name, platform, enabled, created_at FROM webhooks WHERE dashboard_id = ? ORDER BY created_at DESC`,
      args: [dashboardId],
    })
    return NextResponse.json({
      webhooks: (r.rows as any[]).map((w) => ({ ...w, integrationUrls: urlsFor(w.platform, w.id) })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { dashboardId, name, platform, secret } = await req.json()
    await initDb()
    const id = newId()
    await db.execute({
      sql: `INSERT INTO webhooks (id, dashboard_id, name, platform, secret) VALUES (?,?,?,?,?)`,
      args: [id, dashboardId, name || platform, platform, secret || null],
    })
    return NextResponse.json({ id, integrationUrls: urlsFor(platform, id) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    await initDb()
    const r = await db.execute({ sql: `SELECT dashboard_id FROM webhooks WHERE id = ?`, args: [id] })
    if (!r.rows.length) return NextResponse.json({ ok: true })
    await db.execute({ sql: `DELETE FROM webhooks WHERE id = ?`, args: [id] })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
