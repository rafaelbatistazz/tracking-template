/**
 * Check da conversao de moeda:  node scripts/check-fx.mjs
 *
 * Roda o lib/fx.ts de verdade contra um SQLite descartavel, com o fetch
 * trocado por um dublê -- nao chama a API do BCE nem precisa de rede.
 * (E por isso que lib/fx.ts importa './db.ts' com extensao: assim o node
 * carrega o modulo direto, sem bundler.)
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'fx-'))
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'check.db')}`

const { getRate, resetRateCache } = await import('../lib/fx.ts')
const { db } = await import('../lib/db.ts')

let calls = 0
let reply = () => ({ ok: true, body: { date: '2026-09-08', rates: { BRL: 5.4 } } })
globalThis.fetch = async () => {
  calls++
  const r = reply()
  if (r.throws) throw new Error('rede fora')
  return { ok: r.ok, json: async () => r.body }
}

const rows = async () => (await db.execute('SELECT date, base, quote, rate FROM fx_rates ORDER BY date')).rows

try {
  // 1. Mesma moeda nao consulta cotacao nenhuma.
  assert.equal(await getRate('2026-09-08', 'BRL', 'BRL'), 1)
  assert.equal(calls, 0, 'moeda igual nao pode chamar a API')

  // 2. Dia util: usa a cotacao e guarda no banco.
  assert.equal(await getRate('2026-09-08', 'USD', 'BRL'), 5.4)
  assert.equal(calls, 1)
  assert.deepEqual((await rows()).map((r) => r.date), ['2026-09-08'])

  // 3. Segunda leitura sai do banco, mesmo sem o cache de processo.
  resetRateCache()
  assert.equal(await getRate('2026-09-08', 'USD', 'BRL'), 5.4)
  assert.equal(calls, 1, 'taxa ja gravada nao pode bater na API de novo')

  // 4. Fim de semana: a API devolve a cotacao de sexta. Vale pro calculo,
  //    mas nao vira linha do sabado (a cotacao do sabado nao existe).
  reply = () => ({ ok: true, body: { date: '2026-09-11', rates: { BRL: 5.5 } } })
  assert.equal(await getRate('2026-09-12', 'USD', 'BRL'), 5.5)
  assert.equal((await rows()).length, 1, 'cotacao de outro dia nao pode virar linha')
  //    ...nem ficar presa no cache: quando a cotacao do dia sair, ela entra.
  reply = () => ({ ok: true, body: { date: '2026-09-12', rates: { BRL: 5.6 } } })
  assert.equal(await getRate('2026-09-12', 'USD', 'BRL'), 5.6, 'taxa emprestada ficou presa no cache')

  // 5. API fora do ar cai na ultima cotacao conhecida -- nunca em gasto zerado.
  resetRateCache()
  reply = () => ({ throws: true })
  assert.equal(await getRate('2026-09-15', 'USD', 'BRL'), 5.6)

  // 6. Sem cotacao nenhuma pra usar, estoura em vez de inventar taxa.
  resetRateCache()
  await assert.rejects(() => getRate('2026-09-15', 'GBP', 'BRL'))

  console.log('ok — 7 cenarios')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
