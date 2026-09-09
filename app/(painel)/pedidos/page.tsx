'use client'

import { useEffect, useState } from 'react'
import { Table, money, usePanel, useQuery } from '../../components/ui'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  paid: { label: 'Aprovado', color: 'text-good' },
  waiting_payment: { label: 'Pendente', color: 'text-warn' },
  refused: { label: 'Recusado', color: 'text-muted' },
  refunded: { label: 'Reembolsado', color: 'text-bad' },
  chargedback: { label: 'Chargeback', color: 'text-bad' },
}

export default function PedidosPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    setLoading(true)
    fetch(`/api/orders?${query}${status ? `&status=${status}` : ''}`)
      .then((r) => r.json())
      .then((j) => setRows(j.orders || []))
      .finally(() => setLoading(false))
  }, [query, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['', 'Todos'], ['paid', 'Aprovados'], ['waiting_payment', 'Pendentes'], ['refunded', 'Reembolsados']].map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${status === id ? 'border-brand bg-brand/15' : 'border-line text-muted hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : (
        <Table
          rows={rows}
          empty="Nenhum pedido nesse periodo."
          columns={[
            { key: 'created_at', label: 'Data', render: (r) => new Date(r.created_at).toLocaleString('pt-BR') },
            { key: 'products', label: 'Produto', render: (r) => <span className="truncate block max-w-[220px]" title={r.products}>{r.products}</span> },
            { key: 'customer_email', label: 'Cliente', render: (r) => <span className="truncate block max-w-[180px]">{r.customer_name || r.customer_email || '—'}</span> },
            { key: 'platform', label: 'Gateway' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => {
                const s = STATUS_LABEL[r.status] ?? { label: r.status, color: '' }
                return <span className={s.color}>{s.label}</span>
              },
            },
            { key: 'utm_campaign', label: 'Campanha', render: (r) => <span className="truncate block max-w-[180px] text-muted" title={r.utm_campaign}>{r.utm_campaign || '—'}</span> },
            { key: 'net_cents', label: 'Liquido', align: 'right', render: (r) => money(r.net_cents, currency) },
          ]}
        />
      )}
    </div>
  )
}
