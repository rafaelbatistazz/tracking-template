import { NormalizedOrder, OrderStatus, extractUtms, mapStatus, pick, toCents, toIso } from './base'

const STATUS: Record<string, OrderStatus> = {
  SALE_APPROVED: 'paid',
  APPROVED: 'paid',
  SALE_REFUSED: 'refused',
  REFUSED: 'refused',
  SALE_REFUNDED: 'refunded',
  REFUNDED: 'refunded',
  SALE_CHARGEBACK: 'chargedback',
  CHARGEBACK: 'chargedback',
  PIX_GENERATED: 'waiting_payment',
  BANK_SLIP_GENERATED: 'waiting_payment',
  PENDING: 'waiting_payment',
  ABANDONED_CART: 'waiting_payment',
}

export function normalizeKirvano(payload: any): NormalizedOrder | null {
  const externalId = pick(payload, ['sale_id', 'checkout_id', 'id'])
  if (!externalId) return null

  const status = mapStatus(pick(payload, ['event']), STATUS) ?? mapStatus(pick(payload, ['status']), STATUS)
  if (!status) return null

  const { utms, clickIds, visitorId } = extractUtms(payload)
  const gross = toCents(pick(payload, ['total_price', 'total', 'amount']))

  // Kirvano manda a comissao do produtor dentro de products[].price ou em "commission".
  const commission = pick(payload, ['commission.total_price', 'commission.value', 'producer_commission'])
  const net = commission ? toCents(commission) : gross

  const products: any[] = Array.isArray(payload?.products) ? payload.products : []

  return {
    externalId: String(externalId),
    status,
    paymentMethod: normalizeMethod(pick(payload, ['payment.method', 'payment_method'])),
    installments: Number(pick(payload, ['payment.installments'])) || null,
    isRecurring: String(pick(payload, ['type']) || '').toUpperCase() === 'RECURRING',
    saleType: 'producer',

    customerName: pick(payload, ['customer.name']) ?? null,
    customerEmail: pick(payload, ['customer.email']) ?? null,
    customerPhone: pick(payload, ['customer.phone_number', 'customer.phone']) ?? null,
    customerDoc: pick(payload, ['customer.document']) ?? null,
    customerCountry: pick(payload, ['customer.country']) ?? null,
    customerIp: pick(payload, ['customer.ip', 'ip']) ?? null,

    currency: 'BRL',
    grossCents: gross,
    netCents: net,

    utms,
    clickIds,
    visitorId,

    createdAt: toIso(pick(payload, ['created_at'])),
    approvedAt: status === 'paid' ? toIso(pick(payload, ['payment.finished_at', 'finished_at', 'created_at'])) : null,
    refundedAt: status === 'refunded' || status === 'chargedback' ? toIso(pick(payload, ['updated_at', 'created_at'])) : null,

    items: products.length
      ? products.map((p) => ({
          productId: p.id ?? p.offer_id ?? null,
          productName: p.name ?? 'Sem nome',
          planName: p.offer_name ?? null,
          quantity: 1,
          priceCents: toCents(p.price),
          isBump: !!p.is_order_bump,
        }))
      : [{ productName: pick(payload, ['product_name']) ?? 'Sem nome', quantity: 1, priceCents: gross }],
  }
}

function normalizeMethod(m: unknown): string | null {
  if (!m) return null
  const s = String(m).toUpperCase()
  if (s.includes('PIX')) return 'pix'
  if (s.includes('CREDIT') || s.includes('CARD') || s.includes('CARTAO')) return 'credit_card'
  if (s.includes('SLIP') || s.includes('BOLETO')) return 'boleto'
  if (s.includes('FREE')) return 'free'
  return s.toLowerCase()
}
