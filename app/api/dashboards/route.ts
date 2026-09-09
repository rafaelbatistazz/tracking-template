import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDefaultDashboard, initDb, newId } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureDefaultDashboard()
  const r = await db.execute(`SELECT * FROM dashboards ORDER BY created_at`)
  return NextResponse.json({ dashboards: r.rows })
}

export async function POST(req: NextRequest) {
  const { name, currency, tzOffset, viewType } = await req.json()
  await initDb()
  const id = newId()
  await db.execute({
    sql: `INSERT INTO dashboards (id, name, currency, tz_offset, view_type) VALUES (?,?,?,?,?)`,
    args: [id, name || 'Novo dashboard', currency || 'BRL', tzOffset ?? -3, viewType || 'Normal'],
  })
  return NextResponse.json({ id })
}
