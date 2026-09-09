import { createClient } from '@libsql/client'
import { randomBytes } from 'crypto'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

/** Id curto no mesmo formato que os gateways costumam aceitar em querystring. */
export function newId() {
  return randomBytes(12).toString('hex')
}

const SCHEMA = [
  /* Um "dashboard" e o workspace: agrupa pedidos, contas de anuncio e integracoes.
     Da pra ter varios (um por negocio, um por moeda) e trocar no seletor do topo. */
  `CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'BRL',
    tz_offset   INTEGER NOT NULL DEFAULT -3,
    view_type   TEXT NOT NULL DEFAULT 'Normal',  -- Normal = liquido, Total = bruto
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  /* ---------- Pedidos: a tabela central ---------- */
  `CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    dashboard_id   TEXT NOT NULL,
    platform       TEXT NOT NULL,
    external_id    TEXT NOT NULL,
    status         TEXT NOT NULL,           -- waiting_payment|paid|refused|refunded|chargedback
    payment_method TEXT,                    -- credit_card|pix|boleto|paypal|free
    installments   INTEGER,
    is_recurring   INTEGER NOT NULL DEFAULT 0,
    sale_type      TEXT NOT NULL DEFAULT 'producer',

    customer_name    TEXT,
    customer_email   TEXT,
    customer_phone   TEXT,
    customer_doc     TEXT,
    customer_country TEXT,
    customer_ip      TEXT,

    currency          TEXT NOT NULL DEFAULT 'BRL',
    gross_cents       INTEGER NOT NULL DEFAULT 0,  -- pago pelo cliente
    net_cents         INTEGER NOT NULL DEFAULT 0,  -- comissao liquida do produtor
    gateway_fee_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents         INTEGER NOT NULL DEFAULT 0,
    cost_cents        INTEGER NOT NULL DEFAULT 0,  -- custo do produto (cadastro de custos)

    src         TEXT,
    sck         TEXT,
    utm_source  TEXT,
    utm_medium  TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term    TEXT,

    traffic_source TEXT,                    -- meta|google|tiktok|kwai|organic|other
    account_id  TEXT,
    campaign_id TEXT,
    adset_id    TEXT,
    ad_id       TEXT,

    visitor_id  TEXT,
    fbp         TEXT,
    fbc         TEXT,

    created_at  TEXT NOT NULL,              -- data do pedido (ISO, UTC)
    approved_at TEXT,
    refunded_at TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    raw         TEXT,
    UNIQUE (dashboard_id, platform, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_dash_date ON orders (dashboard_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_ad ON orders (dashboard_id, ad_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders (dashboard_id, campaign_id)`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id           TEXT PRIMARY KEY,
    order_id     TEXT NOT NULL,
    dashboard_id TEXT NOT NULL,
    product_id   TEXT,
    product_name TEXT NOT NULL,
    plan_name    TEXT,
    quantity     INTEGER NOT NULL DEFAULT 1,
    price_cents  INTEGER NOT NULL DEFAULT 0,
    is_bump      INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_items_dash ON order_items (dashboard_id, product_name)`,

  /* Custo do produto e imposto, aplicados no calculo de lucro. */
  `CREATE TABLE IF NOT EXISTS product_costs (
    dashboard_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    cost_cents   INTEGER NOT NULL DEFAULT 0,
    tax_percent  REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (dashboard_id, product_name)
  )`,

  /* Despesas fixas/variaveis lancadas manualmente (aparecem no lucro). */
  `CREATE TABLE IF NOT EXISTS expenses (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'fixed', -- fixed (por dia) | one_time
    date         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  /* ---------- Contas de anuncio e metricas ---------- */
  `CREATE TABLE IF NOT EXISTS ad_accounts (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    platform     TEXT NOT NULL,             -- meta|google|tiktok|kwai
    profile_id   TEXT,
    profile_name TEXT,
    account_id   TEXT NOT NULL,             -- sem o prefixo act_
    name         TEXT,
    currency     TEXT NOT NULL DEFAULT 'BRL',
    access_token TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (dashboard_id, platform, account_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ad_objects (
    dashboard_id TEXT NOT NULL,
    platform     TEXT NOT NULL,
    level        TEXT NOT NULL,             -- account|campaign|adset|ad
    object_id    TEXT NOT NULL,
    account_id   TEXT NOT NULL,
    campaign_id  TEXT,
    adset_id     TEXT,
    ad_id        TEXT,
    name         TEXT NOT NULL,
    status       TEXT,
    effective_status TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dashboard_id, platform, level, object_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ad_insights (
    dashboard_id TEXT NOT NULL,
    platform     TEXT NOT NULL,
    date         TEXT NOT NULL,             -- YYYY-MM-DD no fuso do dashboard
    account_id   TEXT NOT NULL,
    campaign_id  TEXT,
    adset_id     TEXT,
    ad_id        TEXT NOT NULL,
    spend_cents  INTEGER NOT NULL DEFAULT 0,
    impressions  INTEGER NOT NULL DEFAULT 0,
    clicks       INTEGER NOT NULL DEFAULT 0,
    link_clicks  INTEGER NOT NULL DEFAULT 0,
    reach        INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dashboard_id, platform, ad_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_insights_dash_date ON ad_insights (dashboard_id, date)`,

  /* ---------- Tracking (script no site) ---------- */
  `CREATE TABLE IF NOT EXISTS visits (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    visitor_id   TEXT NOT NULL,
    session_id   TEXT NOT NULL,
    landing_url  TEXT,
    referrer     TEXT,
    src          TEXT,
    sck          TEXT,
    utm_source   TEXT,
    utm_medium   TEXT,
    utm_campaign TEXT,
    utm_content  TEXT,
    utm_term     TEXT,
    fbclid       TEXT,
    gclid        TEXT,
    ttclid       TEXT,
    fbp          TEXT,
    fbc          TEXT,
    ip           TEXT,
    user_agent   TEXT,
    country      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits (dashboard_id, visitor_id)`,

  `CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    visitor_id   TEXT,
    session_id   TEXT,
    type         TEXT NOT NULL,             -- page_view|view_content|add_to_cart|initiate_checkout|lead|purchase
    url          TEXT,
    value_cents  INTEGER NOT NULL DEFAULT 0,
    currency     TEXT,
    event_id     TEXT,                      -- dedupe com o pixel do browser
    payload      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_dash ON events (dashboard_id, type, created_at)`,

  /* ---------- Integracoes ---------- */
  `CREATE TABLE IF NOT EXISTS webhooks (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    platform     TEXT NOT NULL,             -- kirvano|cakto|hotmart|generic
    enabled      INTEGER NOT NULL DEFAULT 1,
    secret       TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS pixels (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'Meta',
    send_purchase_type TEXT NOT NULL DEFAULT 'paid_sales_only', -- paid_sales_only|paid_and_pending_sales
    send_value_type    TEXT NOT NULL DEFAULT 'commission',      -- commission|gross|no_value
    send_ip_rule       TEXT NOT NULL DEFAULT 'ipv6_fallback_ipv4',
    send_initiate_checkout INTEGER NOT NULL DEFAULT 0,
    ic_detection_type  TEXT,                -- button_text_match|button_css_match|button_url_match
    ic_detection_value TEXT,
    send_lead          INTEGER NOT NULL DEFAULT 0,
    lead_detection_value TEXT,
    send_add_to_cart   INTEGER NOT NULL DEFAULT 0,
    atc_detection_type TEXT,
    atc_detection_value TEXT,
    allowed_domain     TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS pixel_targets (
    id         TEXT PRIMARY KEY,
    pixel_id   TEXT NOT NULL,
    platform_pixel_id TEXT NOT NULL,        -- id do pixel na Meta/TikTok
    name       TEXT,
    capi_token TEXT,
    test_code  TEXT
  )`,

  /* Fila de envio server-side (CAPI). Reprocessa em caso de falha. */
  `CREATE TABLE IF NOT EXISTS capi_queue (
    id           TEXT PRIMARY KEY,
    dashboard_id TEXT NOT NULL,
    pixel_id     TEXT NOT NULL,
    event_name   TEXT NOT NULL,
    payload      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at      TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_capi_status ON capi_queue (status, created_at)`,
]

let ready: Promise<void> | null = null

export function initDb() {
  if (!ready) {
    ready = (async () => {
      for (const sql of SCHEMA) await db.execute(sql)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

/**
 * Sem login, o app precisa de pelo menos um dashboard pra funcionar.
 * Cria na primeira vez que alguem abre.
 */
export async function ensureDefaultDashboard(): Promise<string> {
  await initDb()
  const r = await db.execute(`SELECT id FROM dashboards ORDER BY created_at LIMIT 1`)
  if (r.rows.length) return String((r.rows[0] as any).id)

  const id = newId()
  await db.execute({ sql: `INSERT INTO dashboards (id, name) VALUES (?, ?)`, args: [id, 'Meu dashboard'] })
  return id
}

/** Valida que o dashboard existe antes de consultar metricas. */
export async function dashboardExists(id: string): Promise<boolean> {
  await initDb()
  const r = await db.execute({ sql: `SELECT 1 FROM dashboards WHERE id = ? LIMIT 1`, args: [id] })
  return r.rows.length > 0
}
