/**
 * Conversao de moeda pro dashboard.
 *
 * Conta de anuncio em USD e dashboard em BRL: sem isso o gasto entra somado
 * cru no faturamento e ROAS, lucro e CPA saem errados.
 *
 * Taxa diaria do frankfurter.app (BCE, sem chave, com historico). Guardada em
 * fx_rates: o sync roda por linha de anuncio, entao a API leva uma chamada por
 * par/dia, nao uma por linha.
 */
import { db, initDb } from './db.ts'

const API = process.env.FX_API_URL || 'https://api.frankfurter.app'

/** Cache de processo, pra taxa sem cotacao propria (fim de semana, feriado). */
const mem = new Map<string, number>()

async function lastKnown(from: string, to: string, date: string): Promise<number | null> {
  const r = await db.execute({
    sql: `SELECT rate FROM fx_rates WHERE base = ? AND quote = ? AND date <= ? ORDER BY date DESC LIMIT 1`,
    args: [from, to, date],
  })
  return r.rows.length ? Number((r.rows[0] as any).rate) : null
}

/**
 * Taxa de `from` pra `to` na data pedida (YYYY-MM-DD).
 *
 * O BCE nao cota fim de semana nem feriado: nesses dias a API responde com a
 * cotacao do ultimo dia util e devolve a data dela em `date`. Quando a data
 * volta diferente da pedida, a taxa vale pro calculo mas nao vira linha em
 * fx_rates -- senao o dia ficaria congelado numa cotacao que ainda vai sair.
 */
export async function getRate(date: string, from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 1
  await initDb()

  const key = `${date}|${from}|${to}`
  const cached = mem.get(key)
  if (cached) return cached

  const row = await db.execute({
    sql: `SELECT rate FROM fx_rates WHERE date = ? AND base = ? AND quote = ?`,
    args: [date, from, to],
  })
  if (row.rows.length) {
    const rate = Number((row.rows[0] as any).rate)
    mem.set(key, rate)
    return rate
  }

  try {
    const res = await fetch(`${API}/${date}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    const json: any = await res.json()
    const rate = Number(json?.rates?.[to])
    if (!res.ok || !rate) throw new Error(json?.message || `sem cotacao ${from}->${to} em ${date}`)

    if (json.date === date) {
      await db.execute({
        sql: `INSERT INTO fx_rates (date, base, quote, rate, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
              ON CONFLICT (date, base, quote) DO UPDATE SET rate = excluded.rate, updated_at = datetime('now')`,
        args: [date, from, to, rate],
      })
    }
    mem.set(key, rate)
    return rate
  } catch (e) {
    // API fora do ar nao pode virar gasto zerado: usa a ultima cotacao conhecida.
    const fallback = await lastKnown(from, to, date)
    if (fallback) return fallback
    throw e
  }
}

/** So pro check: zera o cache de processo entre cenarios. */
export function resetRateCache() {
  mem.clear()
}
