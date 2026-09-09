import { NormalizedOrder, OrderStatus, extractUtms, mapStatus, pick, toCents, toIso } from './base'

const STATUS: Record<string, OrderStatus> = {
  PURCHASE_APPROVED: 'paid',
  PAID: 'paid',
  APPROVED: 'paid',
  PURCHASE_REFUSED: 'refused',
  REFUSED: 'refused',
  REFUND: 'refunded',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargedback',
  WAITING_PAYMENT: 'waiting_payment',
  PENDING: 'waiting_payment',
  ABANDONED_CART: 'waiting_payment',
}

export function normalizeCakto(payload: any): NormalizedOrder | null {
  const data = payload?.data ?? payload
  const externalId = pick(data, ['id', 'transaction_id', 'order_id'])
  if (!externalId) return null

  const status =
    mapStatus(pick(payload, ['event']), STATUS) ?? mapStatus(pick(data, ['status']), STATUS)
  if (!status) return null

  const { utms, clickIds, visitorId } = extractUtms(payload)

  const gross = toCents(pick(data, ['amount', 'baseAmount', 'total', 'offer.price']))
  const commission = pick(data, ['commission', 'producerCommission', 'netAmount'])
  const net = commission != null ? toCents(commission) : gross

  const product = pick(data, ['product']) ?? {}
  const offer = pick(data, ['offer']) ?? {}
  const bumps: any[] = Array.isArray(data?.orderBumps) ? data.orderBumps : []

  const items = [
    {
      productId: product.id ?? null,
      productName: product.name ?? 'Sem nome',
      planName: offer.name ?? null,
      quantity: 1,
      priceCents: gross,
      isBump: false,
    },
    ...bumps.map((b) => ({
      productId: b?.product?.id ?? null,
      productName: b?.product?.name ?? b?.name ?? 'Order bump',
      quantity: 1,
      priceCents: toCents(b?.amount ?? b?.price),
      isBump: true,
    })),
  ]

  return {
    externalId: String(externalId),
    status,
    paymentMethod: normalizeMethod(pick(data, ['paymentMethod', 'payment_method'])),
    installments: Number(pick(data, ['installments'])) || null,
    isRecurring: !!pick(data, ['subscription', 'subscriptionId']),
    saleType: 'producer',

    customerName: pick(data, ['customer.name']) ?? null,
    customerEmail: pick(data, ['customer.email']) ?? null,
    customerPhone: pick(data, ['customer.phone']) ?? null,
    customerDoc: pick(data, ['customer.docNumber', 'customer.document']) ?? null,
    customerCountry: pick(data, ['customer.country']) ?? null,
    customerIp: pick(data, ['customer.ip', 'ip']) ?? null,

    currency: 'BRL',
    grossCents: gross,
    netCents: net,

    utms,
    clickIds,
    visitorId,

    createdAt: toIso(pick(data, ['createdAt', 'created_at'])),
    approvedAt: status === 'paid' ? toIso(pick(data, ['paidAt', 'approvedAt', 'createdAt'])) : null,
    refundedAt: status === 'refunded' || status === 'chargedback' ? toIso(pick(data, ['refundedAt', 'updatedAt'])) : null,

    items,
  }
}

function normalizeMethod(m: unknown): string | null {
  if (!m) return null
  const s = String(m).toLowerCase()
  if (s.includes('pix')) return 'pix'
  if (s.includes('credit') || s.includes('card') || s.includes('cartao')) return 'credit_card'
  if (s.includes('boleto') || s.includes('slip')) return 'boleto'
  return s
}
