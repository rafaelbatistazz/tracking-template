import { NormalizedOrder, OrderStatus, extractUtms, mapStatus, pick, toCents, toIso } from './base'

const STATUS: Record<string, OrderStatus> = {
  PAID: 'paid',
  APPROVED: 'paid',
  COMPLETED: 'paid',
  REFUSED: 'refused',
  DECLINED: 'refused',
  REFUNDED: 'refunded',
  CHARGEBACK: 'chargedback',
  CHARGEDBACK: 'chargedback',
  WAITING_PAYMENT: 'waiting_payment',
  PENDING: 'waiting_payment',
}

/**
 * Adaptador aberto: aceita qualquer gateway que consiga mandar um JSON com
 * order_id / status / value. Serve pra plugar plataforma nova sem escrever codigo.
 */
export function normalizeGeneric(payload: any): NormalizedOrder | null {
  const externalId = pick(payload, ['order_id', 'orderId', 'transaction_id', 'id', 'data.id'])
  if (!externalId) return null

  const status = mapStatus(pick(payload, ['status', 'event', 'data.status']), STATUS)
  if (!status) return null

  const { utms, clickIds, visitorId } = extractUtms(payload)
  const gross = toCents(pick(payload, ['gross', 'total', 'amount', 'value', 'data.amount']))
  const netRaw = pick(payload, ['net', 'commission', 'data.commission'])

  return {
    externalId: String(externalId),
    status,
    paymentMethod: (pick(payload, ['payment_method', 'paymentMethod']) as string) ?? null,
    installments: Number(pick(payload, ['installments'])) || null,
    isRecurring: !!pick(payload, ['recurring', 'is_recurring']),
    saleType: 'producer',

    customerName: pick(payload, ['customer.name', 'buyer.name', 'customer_name']) ?? null,
    customerEmail: pick(payload, ['customer.email', 'buyer.email', 'customer_email']) ?? null,
    customerPhone: pick(payload, ['customer.phone', 'buyer.phone']) ?? null,
    customerDoc: pick(payload, ['customer.document']) ?? null,
    customerCountry: pick(payload, ['customer.country']) ?? null,
    customerIp: pick(payload, ['customer.ip', 'ip']) ?? null,

    currency: (pick(payload, ['currency']) as string) ?? 'BRL',
    grossCents: gross,
    netCents: netRaw != null ? toCents(netRaw) : gross,

    utms,
    clickIds,
    visitorId,

    createdAt: toIso(pick(payload, ['created_at', 'createdAt', 'date'])),
    approvedAt: status === 'paid' ? toIso(pick(payload, ['paid_at', 'approved_at', 'created_at'])) : null,
    refundedAt: null,

    items: [
      {
        productId: pick(payload, ['product.id', 'product_id']) ?? null,
        productName: pick(payload, ['product.name', 'product_name', 'product']) ?? 'Sem nome',
        quantity: 1,
        priceCents: gross,
      },
    ],
  }
}
