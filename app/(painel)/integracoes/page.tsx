'use client'

import { useEffect, useState } from 'react'
import { usePanel } from '../../components/ui'

const PLATFORMS = [
  { id: 'kirvano', label: 'Kirvano' },
  { id: 'cakto', label: 'Cakto' },
  { id: 'hotmart', label: 'Hotmart' },
  { id: 'generic', label: 'Generico' },
]

const URL_TEMPLATE =
  'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}&src={{site_source_name}}'

export default function IntegracoesPage() {
  const { dashboardId } = usePanel()
  const [tab, setTab] = useState<'script' | 'webhooks' | 'contas' | 'custos'>('script')

  if (!dashboardId) return <p className="text-muted">Carregando...</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          ['script', 'Script + UTMs'],
          ['webhooks', 'Webhooks'],
          ['contas', 'Contas de anuncio'],
          ['custos', 'Custos'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${tab === id ? 'border-brand bg-brand/15' : 'border-line text-muted hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'script' && <ScriptTab dashboardId={dashboardId} />}
      {tab === 'webhooks' && <WebhooksTab dashboardId={dashboardId} />}
      {tab === 'contas' && <AccountsTab dashboardId={dashboardId} />}
      {tab === 'custos' && <CostsTab dashboardId={dashboardId} />}
    </div>
  )
}

function Box({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
      <div>
        <div className="font-medium">{title}</div>
        {hint && <div className="text-muted text-xs mt-1">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 bg-ink border border-line rounded-lg p-3 text-xs break-all">{text}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
        className="text-xs px-3 py-2 rounded-lg border border-line hover:border-brand shrink-0"
      >
        {done ? 'copiado' : 'copiar'}
      </button>
    </div>
  )
}

function ScriptTab({ dashboardId }: { dashboardId: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const snippet = `<script src="${origin}/t.js" data-id="${dashboardId}" defer></script>`

  return (
    <div className="space-y-4">
      <Box title="1. Script na pagina de vendas"
           hint="Cole antes do </head> em toda pagina que recebe trafego pago. Ele guarda as UTMs e repassa pro checkout.">
        <Copy text={snippet} />
      </Box>

      <Box title="2. Parametros de URL no anuncio"
           hint="No Gerenciador da Meta, campo 'Parametros de URL' do anuncio. E daqui que sai o id que casa a venda com o gasto.">
        <Copy text={URL_TEMPLATE} />
        <p className="text-muted text-xs">
          O padrao e <code className="text-white">nome|id</code>: o nome aparece na tabela, o id faz a atribuicao. Sem o id, a venda
          entra como nao trackeada.
        </p>
      </Box>

      <Box title="3. Checkout" hint="Confira que o gateway repassa as UTMs no webhook.">
        <p className="text-muted text-xs">
          O script carimba todos os links da pagina, entao o clique no botao de compra ja leva as UTMs pro checkout. Alem disso ele
          manda um <code className="text-white">rt_vid</code>: se o gateway comer as UTMs, a venda ainda e recuperada por esse id.
        </p>
      </Box>
    </div>
  )
}

function WebhooksTab({ dashboardId }: { dashboardId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [platform, setPlatform] = useState('kirvano')
  const [name, setName] = useState('')

  const load = () =>
    fetch(`/api/integrations/webhooks?dashboardId=${dashboardId}`)
      .then((r) => r.json())
      .then((j) => setItems(j.webhooks || []))

  useEffect(() => {
    load()
  }, [dashboardId])

  async function create() {
    await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId, platform, name: name || undefined }),
    })
    setName('')
    load()
  }

  return (
    <div className="space-y-4">
      <Box title="Novo webhook" hint="Cria a URL que voce cola no painel do gateway.">
        <div className="flex flex-wrap gap-2">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}
                  className="bg-ink border border-line rounded-lg px-3 py-2 text-sm">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apelido (opcional)"
                 className="bg-ink border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]" />
          <button onClick={create} className="bg-brand rounded-lg px-4 py-2 text-sm font-medium">Criar</button>
        </div>
      </Box>

      {items.map((w) => (
        <Box key={w.id} title={`${w.name} — ${w.platform}`}>
          <div className="space-y-2">
            {w.integrationUrls.map((u: any) => (
              <div key={u.url}>
                <div className="text-muted text-xs mb-1">{u.title}</div>
                <Copy text={u.url} />
              </div>
            ))}
          </div>
          <button
            onClick={async () => {
              await fetch(`/api/integrations/webhooks?id=${w.id}`, { method: 'DELETE' })
              load()
            }}
            className="text-xs text-bad hover:underline"
          >
            Remover
          </button>
        </Box>
      ))}
    </div>
  )
}

function AccountsTab({ dashboardId }: { dashboardId: string }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')

  const load = () =>
    fetch(`/api/integrations/accounts?dashboardId=${dashboardId}`)
      .then((r) => r.json())
      .then((j) => setAccounts(j.accounts || []))

  useEffect(() => {
    load()
  }, [dashboardId])

  async function connect() {
    setMsg('importando...')
    const res = await fetch('/api/integrations/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId, accessToken: token || undefined }),
    })
    const j = await res.json()
    setMsg(j.error ? j.error : `${j.imported} contas importadas`)
    setToken('')
    load()
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch('/api/integrations/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    })
    load()
  }

  return (
    <div className="space-y-4">
      <Box title="Conectar Meta Ads" hint="Token de usuario de sistema com permissao ads_read. Fica no servidor, nunca no navegador.">
        <div className="flex flex-wrap gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Access token (ou usa o META_ACCESS_TOKEN do .env)"
                 className="bg-ink border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[240px]" type="password" />
          <button onClick={connect} className="bg-brand rounded-lg px-4 py-2 text-sm font-medium">Importar contas</button>
        </div>
        {msg && <p className="text-muted text-xs">{msg}</p>}
      </Box>

      <Box title="Contas" hint="Habilite so as contas que voce quer sincronizar — cada uma consome chamada de API.">
        <div className="space-y-1">
          {accounts.length === 0 && <p className="text-muted text-sm">Nenhuma conta ainda.</p>}
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-line last:border-0">
              <input type="checkbox" checked={!!a.enabled} onChange={(e) => toggle(a.id, e.target.checked)} />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-muted text-xs">{a.account_id}</span>
              <span className="text-muted text-xs">{a.currency}</span>
            </label>
          ))}
        </div>
      </Box>
    </div>
  )
}

function CostsTab({ dashboardId }: { dashboardId: string }) {
  const [data, setData] = useState<{ costs: any[]; products: string[] }>({ costs: [], products: [] })
  const [form, setForm] = useState({ productName: '', cost: '', tax: '' })

  const load = () =>
    fetch(`/api/integrations/costs?dashboardId=${dashboardId}`)
      .then((r) => r.json())
      .then(setData)

  useEffect(() => {
    load()
  }, [dashboardId])

  async function save() {
    await fetch('/api/integrations/costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardId,
        productName: form.productName,
        costCents: Math.round(parseFloat(form.cost.replace(',', '.') || '0') * 100),
        taxPercent: parseFloat(form.tax.replace(',', '.') || '0'),
        applyToExisting: true,
      }),
    })
    setForm({ productName: '', cost: '', tax: '' })
    load()
  }

  return (
    <div className="space-y-4">
      <Box title="Custo por produto" hint="Entra no calculo de lucro. Ao salvar, recalcula tambem os pedidos ja registrados.">
        <div className="flex flex-wrap gap-2">
          <select value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  className="bg-ink border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]">
            <option value="">Escolha o produto</option>
            {data.products.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Custo (R$)"
                 className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-32" />
          <input value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="Imposto (%)"
                 className="bg-ink border border-line rounded-lg px-3 py-2 text-sm w-32" />
          <button onClick={save} disabled={!form.productName} className="bg-brand disabled:opacity-40 rounded-lg px-4 py-2 text-sm font-medium">
            Salvar
          </button>
        </div>
      </Box>

      <Box title="Cadastrados">
        {data.costs.length === 0 ? (
          <p className="text-muted text-sm">Nenhum custo cadastrado.</p>
        ) : (
          <div className="space-y-1">
            {data.costs.map((c) => (
              <div key={c.product_name} className="flex justify-between text-sm py-1.5 border-b border-line last:border-0">
                <span className="truncate">{c.product_name}</span>
                <span className="text-muted text-xs">
                  R$ {(c.cost_cents / 100).toFixed(2)} · {c.tax_percent}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Box>
    </div>
  )
}
