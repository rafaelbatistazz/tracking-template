'use client'

import { useEffect, useState } from 'react'
import { Table, money, num, ratio, usePanel, useQuery } from '../../components/ui'

const GROUPS = [
  { id: 'utmCampaign', label: 'Campanha' },
  { id: 'utmMedium', label: 'Conjunto' },
  { id: 'utmContent', label: 'Anuncio' },
  { id: 'utmSource', label: 'Origem' },
  { id: 'utmTerm', label: 'Posicionamento' },
  { id: 'src', label: 'src' },
]

export default function UtmsPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [groupBy, setGroupBy] = useState('utmCampaign')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    setLoading(true)
    fetch(`/api/metrics/utms?${query}&groupBy=${groupBy}`)
      .then((r) => r.json())
      .then((j) => setRows(j.results || []))
      .finally(() => setLoading(false))
  }, [query, groupBy])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroupBy(g.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${groupBy === g.id ? 'border-brand bg-brand/15' : 'border-line text-muted hover:text-white'}`}>
            {g.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : (
        <Table
          rows={rows}
          empty="Nenhuma venda com UTM nesse periodo."
          columns={[
            { key: 'value', label: 'Valor da UTM', render: (r) => <span className="truncate block max-w-[280px]" title={r.value}>{r.value}</span> },
            { key: 'spend', label: 'Gasto', align: 'right', render: (r) => money(r.spend, currency) },
            { key: 'revenue', label: 'Faturamento', align: 'right', render: (r) => money(r.revenue, currency) },
            { key: 'profit', label: 'Lucro', align: 'right', render: (r) => <span className={r.profit >= 0 ? 'text-good' : 'text-bad'}>{money(r.profit, currency)}</span> },
            { key: 'roas', label: 'ROAS', align: 'right', render: (r) => ratio(r.roas) },
            { key: 'approvedOrders', label: 'Aprovadas', align: 'right', render: (r) => num(r.approvedOrders) },
            { key: 'pendingOrders', label: 'Pendentes', align: 'right', render: (r) => num(r.pendingOrders) },
            { key: 'cpa', label: 'CPA', align: 'right', render: (r) => (r.cpa == null ? '—' : money(r.cpa, currency)) },
            { key: 'averageTicket', label: 'Ticket', align: 'right', render: (r) => money(r.averageTicket, currency) },
          ]}
        />
      )}
    </div>
  )
}
