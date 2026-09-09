'use client'

import { useEffect, useState } from 'react'
import { Table, money, num, pct, ratio, usePanel, useQuery } from '../../components/ui'

const LEVELS = [
  { id: 'account', label: 'Contas' },
  { id: 'campaign', label: 'Campanhas' },
  { id: 'adset', label: 'Conjuntos' },
  { id: 'ad', label: 'Anuncios' },
]

export default function AnunciosPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [level, setLevel] = useState('campaign')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    setLoading(true)
    fetch(`/api/metrics/adobjects?${query}&level=${level}`)
      .then((r) => r.json())
      .then((j) => setRows(j.results || []))
      .finally(() => setLoading(false))
  }, [query, level])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button key={l.id} onClick={() => setLevel(l.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${level === l.id ? 'border-brand bg-brand/15' : 'border-line text-muted hover:text-white'}`}>
            {l.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : (
        <Table
          rows={rows}
          empty="Sem dados. Conecte uma conta de anuncios em Integracoes e rode a sincronizacao."
          columns={[
            {
              key: 'name',
              label: 'Nome',
              render: (r) => (
                <div className="max-w-[280px]">
                  <div className="truncate" title={r.name}>{r.name}</div>
                  {r.status && <div className="text-[10px] text-muted uppercase">{r.status}</div>}
                </div>
              ),
            },
            { key: 'spend', label: 'Gasto', align: 'right', render: (r) => money(r.spend, currency) },
            { key: 'revenue', label: 'Faturamento', align: 'right', render: (r) => money(r.revenue, currency) },
            { key: 'profit', label: 'Lucro', align: 'right', render: (r) => <span className={r.profit >= 0 ? 'text-good' : 'text-bad'}>{money(r.profit, currency)}</span> },
            { key: 'roas', label: 'ROAS', align: 'right', render: (r) => ratio(r.roas) },
            { key: 'approvedOrders', label: 'Vendas', align: 'right', render: (r) => num(r.approvedOrders) },
            { key: 'cpa', label: 'CPA', align: 'right', render: (r) => (r.cpa == null ? '—' : money(r.cpa, currency)) },
            { key: 'cpm', label: 'CPM', align: 'right', render: (r) => (r.cpm == null ? '—' : money(r.cpm, currency)) },
            { key: 'ctr', label: 'CTR', align: 'right', render: (r) => pct(r.ctr, 2) },
          ]}
        />
      )}
    </div>
  )
}
