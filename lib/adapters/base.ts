import type { Utms } from '../utm'

export type OrderStatus = 'waiting_payment' | 'paid' | 'refused' | 'refunded' | 'chargedback'

export type NormalizedItem = {
  productId?: string | null
  productName: string
  planName?: string | null
  quantity?: number
  priceCents?: number
  isBump?: boolean
}

export type NormalizedOrder = {
  externalId: string
  status: OrderStatus
  paymentMethod?: string | null
  installments?: number | null
  isRecurring?: boolean
  saleType?: 'producer' | 'affiliate' | 'co-producer'

  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  customerDoc?: string | null
  customerCountry?: string | null
  customerIp?: string | null

  currency?: string
  grossCents: number
  netCents: number
  gatewayFeeCents?: number

  utms: Utms
  clickIds?: { fbclid?: string | null; gclid?: string | null; ttclid?: string | null }
  visitorId?: string | null

  createdAt: string // ISO
  approvedAt?: string | null
  refundedAt?: string | null

  items: NormalizedItem[]
}

/** Aceita 100, "100.00", "R$ 1.234,56", "1,234.56" e devolve centavos. */
export function toCents(input: unknown): number {
  if (input == null) return 0
  if (typeof input === 'number') return Math.round(input * 100)

  let s = String(input).trim()
  if (!s) return 0
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return 0

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma > lastDot) {
    // formato pt-BR: 1.234,56
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // formato en-US: 1,234.56
    s = s.replace(/,/g, '')
  }

  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Valores ja em centavos em alguns gateways. */
export function centsOrCents(input: unknown): number {
  if (typeof input === 'number' && Number.isInteger(input)) return input
  return toCents(input)
}

export function toIso(input: unknown): string {
  if (!input) return new Date().toISOString()
  if (typeof input === 'number') {
    // epoch em segundos ou milissegundos
    const ms = input < 1e12 ? input * 1000 : input
    return new Date(ms).toISOString()
  }
  const s = String(input)
  // "2026-03-19 14:22:01" (sem fuso) -> assume UTC
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Busca uma chave em varios caminhos possiveis do payload. */
export function pick(obj: any, paths: string[]): any {
  for (const path of paths) {
    let cur = obj
    let ok = true
    for (const key of path.split('.')) {
      if (cur == null || typeof cur !== 'object' || !(key in cur)) {
        ok = false
        break
      }
      cur = cur[key]
    }
    if (ok && cur !== null && cur !== undefined && cur !== '') return cur
  }
  return undefined
}

const UTM_FIELDS = ['src', 'sck', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/**
 * Cada gateway coloca as UTMs num lugar. Em vez de um caminho fixo por gateway,
 * varremos os lugares conhecidos e, se o campo "src" vier com uma querystring
 * inteira dentro (acontece), abrimos ela tambem.
 */
export function extractUtms(payload: any, extraRoots: string[] = []): { utms: Utms; clickIds: Record<string, string | null>; visitorId: string | null } {
  const roots = [payload, ...extraRoots.map((p) => pick(payload, [p])), payload?.utm, payload?.utms, payload?.data, payload?.data?.utm, payload?.data?.utms, payload?.tracking, payload?.data?.tracking].filter(
    (r) => r && typeof r === 'object'
  )

  const utms: Record<string, string | null> = {}
  const clickIds: Record<string, string | null> = { fbclid: null, gclid: null, ttclid: null }
  let visitorId: string | null = null

  for (const root of roots) {
    for (const f of UTM_FIELDS) {
      if (!utms[f] && root[f]) utms[f] = String(root[f])
    }
    for (const c of ['fbclid', 'gclid', 'ttclid']) {
      if (!clickIds[c] && root[c]) clickIds[c] = String(root[c])
    }
    if (!visitorId && (root.rt_vid || root.visitor_id)) visitorId = String(root.rt_vid || root.visitor_id)
  }

  // src carregando a querystring inteira: "utm_source=FB&utm_campaign=..."
  const nested = utms.src || utms.sck
  if (nested && nested.includes('utm_')) {
    const qs = new URLSearchParams(nested.replace(/^\?/, ''))
    for (const f of UTM_FIELDS) {
      const v = qs.get(f)
      if (v && (!utms[f] || f === 'src')) utms[f] = v
    }
    if (!visitorId && qs.get('rt_vid')) visitorId = qs.get('rt_vid')
  }

  return { utms: utms as Utms, clickIds, visitorId }
}

export function mapStatus(raw: string | undefined | null, table: Record<string, OrderStatus>): OrderStatus | null {
  if (!raw) return null
  const key = String(raw).toUpperCase().replace(/[\s-]/g, '_')
  return table[key] ?? null
}
