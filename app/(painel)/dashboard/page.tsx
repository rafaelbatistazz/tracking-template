'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, money, num, pct, ratio, usePanel, useQuery } from '../../components/ui'

export default function DashboardPage() {
  const query = useQuery()
  const { currency } = usePanel()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!query) return
    setLoading(true)
    fetch(`/api/metrics/summary?${query}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [query])

  if (loading || !data) return <p className="text-muted">Carregando...</p>
  if (data.error) return <p className="text-bad">{data.error}</p>

  const o = data.ordersCount
  const vazio = o.total === 0 && data.spend === 0

  return (
    <div className="space-y-6">
      {vazio && <PrimeiroUso />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Faturamento liquido" value={money(data.revenue, currency)} hint={`bruto ${money(data.grossRevenue, currency)}`} />
        <Card label="Gastos com anuncios" value={money(data.spend, currency)} />
        <Card label="Lucro" value={money(data.profit, currency)} tone={data.profit >= 0 ? 'good' : 'bad'}
              hint={`margem ${pct(data.margin)}`} />
        <Card label="ROAS" value={ratio(data.roas)} hint={`ROI ${data.roi == null ? '—' : pct(data.roi, 0)}`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Vendas aprovadas" value={num(o.approved)} hint={`${num(o.total)} no total`} />
        <Card label="Pendentes" value={num(o.pending)} hint={money(data.pendingRevenue, currency)} />
        <Card label="Ticket medio" value={money(data.averageTicket, currency)} />
        <Card label="CPA" value={data.cpa == null ? '—' : money(data.cpa, currency)}
              hint={`CPT ${data.cpt == null ? '—' : money(data.cpt, currency)}`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Reembolsos" value={num(o.refunded)} tone={o.refunded ? 'bad' : 'neutral'} />
        <Card label="Chargebacks" value={num(o.chargedback)} tone={o.chargedback ? 'bad' : 'neutral'} />
        <Card label="Aprovacao no cartao" value={pct(data.approvalRate)} hint={`${num(o.creditCardApproved)}/${num(o.creditCardTotal)}`} />
        <Card label="Vendas sem tracking" value={num(data.untrackedApproved)} tone={data.untrackedApproved ? 'bad' : 'good'}
              hint="aprovadas sem UTM" />
      </div>

      <Chart title="Faturamento por dia" rows={data.byDay} xKey="day" currency={currency} />
      <Chart title="Faturamento por hora" rows={data.byHour} xKey="hour" currency={currency} />

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Produtos" vazio={data.byProduct.length === 0}>
          {data.byProduct.map((p: any) => (
            <Row key={p.name} label={p.name} value={money(p.revenue, currency)} sub={`${num(p.sales)} vendas`} />
          ))}
        </Panel>
        <Panel title="Origem do trafego" vazio={data.bySource.length === 0}>
          {data.bySource.map((s: any) => (
            <Row key={s.source} label={s.source} value={money(s.revenue, currency)} sub={`${num(s.orders)} pedidos`} />
          ))}
        </Panel>
      </div>
    </div>
  )
}

function Chart({ title, rows, xKey, currency }: { title: string; rows: any[]; xKey: string; currency: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-sm text-muted mb-3">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey={xKey} stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => String(Math.round(v / 100))} />
            <Tooltip
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8 }}
              formatter={(v: any) => money(v, currency)}
            />
            <Bar dataKey="revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function Panel({ title, children, vazio }: { title: string; children: React.ReactNode; vazio?: boolean }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <div className="text-sm text-muted mb-3">{title}</div>
      {vazio ? <p className="text-muted text-sm py-6 text-center">Sem dados nesse periodo.</p> : <div className="space-y-2">{children}</div>}
    </div>
  )
}

/** Aparece enquanto o dashboard nao recebeu nenhuma venda nem gasto. */
function PrimeiroUso() {
  return (
    <div className="border border-brand/40 bg-brand/5 rounded-xl p-5">
      <div className="font-medium mb-2">Nenhum dado ainda — faltam tres passos</div>
      <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
        <li>Cole o script na sua pagina de vendas</li>
        <li>Cole os parametros de URL no anuncio</li>
        <li>Aponte o webhook do gateway pra ca</li>
      </ol>
      <Link href="/integracoes" className="inline-block mt-3 text-sm text-brand hover:underline">
        Ir para Integracoes
      </Link>
    </div>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="truncate">{label}</span>
      <span className="text-right shrink-0">
        {value} <span className="text-muted text-xs">{sub}</span>
      </span>
    </div>
  )
}
