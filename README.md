# Template de tracking e atribuicao

Tracking e atribuicao de vendas para trafego pago. Liga o gasto do anuncio a
venda do gateway e mostra lucro real por campanha, conjunto e anuncio.

Template limpo: sobe sem nenhum dado e sem tela de login. Abriu, ja esta dentro —
o dashboard padrao se cria sozinho no primeiro acesso.

> **Nao tem autenticacao.** Quem alcancar a URL ve o faturamento. Roda local ou
> atras de algo que ja protege (rede interna, tunel, Basic Auth do proxy,
> protecao de deploy da Vercel). Se for expor na internet aberta, ponha uma
> camada de acesso antes.

## Como funciona

```
  anuncio (Meta/Google/TikTok)
        │  parametros de URL: nome|id
        ▼
  landing  ──[ /t.js ]──►  POST /api/collect       (visita + UTMs + fbp/fbc)
        │                        │
        │ links carimbados        └──► tabela visits  ─┐
        ▼                                              │ recupera UTM
  checkout do gateway                                  │ quando o gateway
        │                                              │ nao repassa
        ▼                                              │
  POST /api/webhooks/<gateway>?id=…  ──► adapters ──► ingestOrder ◄┘
                                                        │
                              parseAdRef: "Nome|1202109…" → campaign_id/adset_id/ad_id
                                                        │
  GET /api/cron/sync-meta ──► Meta Marketing API ──► ad_insights (gasto por anuncio/dia)
                                                        │
                                                        ▼
                                          /api/metrics/*  →  dashboard
```

O pulo do gato e o formato `nome|id` nos parametros de URL do anuncio: o nome e
pra voce ler na tabela, o id e o que casa a venda com o gasto que veio da API.

## Colocar a sua marca

O template vem **sem nome**. Sao dois pontos, os dois fora do codigo de negocio:

**Nome** — em `.env.local`:

```
NEXT_PUBLIC_APP_NAME=Nome Do Seu App
```

Vazio, a barra lateral mostra so o simbolo e a aba fica "Dashboard". Nada quebra.

Por ser `NEXT_PUBLIC_`, o valor entra no bundle na hora do build: depois de mexer
no `.env.local`, reinicie o `npm run dev` (ou rode `npm run build` de novo em
producao) pra ver o nome trocar.

**Cores** — as sete variaveis em `:root` no `app/globals.css`. Tailwind e os
graficos leem de la, entao muda ali e o app inteiro acompanha.

O simbolo em si (o quadrado laranja) esta em `app/components/logo.tsx` — troque
por um `<img>` ou um SVG quando tiver o logo pronto.

## Subir local

```bash
npm install
cp .env.example .env.local   # ajuste NEXT_PUBLIC_URL
npm run dev                  # http://localhost:3210
```

Sem `TURSO_DATABASE_URL` ele usa um SQLite em `local.db`. O schema se cria sozinho
na primeira requisicao — nao existe migration pra rodar nem seed pra popular.

Pra zerar tudo e comecar do nada de novo: apague o `local.db`.

## Ligar em producao

1. **Script** — em Integracoes > Script, copie e cole antes do `</head>` da pagina de vendas.
2. **Parametros de URL** — cole o template no campo "Parametros de URL" do anuncio na Meta.
3. **Webhook** — crie em Integracoes > Webhooks e cole a URL no painel do gateway.
4. **Meta Ads** — em Integracoes > Contas, cole um token de sistema com `ads_read` e habilite as contas.
5. **Crons** — agende:
   - `GET /api/cron/sync-meta?days=3` a cada 15-30 min (header `x-cron-secret`)
   - `GET /api/cron/flush-capi` a cada 1-5 min

## O que ja esta pronto

- Script de tracking: captura UTMs + click ids, janela de atribuicao, first/last click,
  cookie no dominio raiz, carimbo de links (inclusive os inseridos depois via MutationObserver),
  deteccao de InitiateCheckout / Lead / AddToCart por texto, CSS ou URL.
- Recuperacao de venda sem UTM pelo `rt_vid` gravado na visita.
- Adapters de webhook: Kirvano, Cakto, Hotmart e um generico pra qualquer gateway.
  Variacoes de URL por afiliado, co-produtor e ignorar recorrencia.
- Atribuicao ate o nivel de anuncio, com a hierarquia completada pela tabela `ad_objects`.
- Sync da Meta Marketing API: gasto/impressoes/cliques por anuncio por dia + status.
- Metricas: faturamento liquido e bruto, gasto, lucro, ROAS, ROI, margem, CPA/CPT/CPP,
  ticket medio, taxa de aprovacao no cartao, CPM, CPC, CTR, vendas sem tracking.
- Custo por produto e imposto, com recalculo dos pedidos ja gravados.
- Pixel server-side (Conversions API) com fila e retry, dedupe por `event_id`,
  regra de IP (so IPv6 / com fallback / sem IP), valor por comissao ou bruto.
- Multi-dashboard (um por negocio ou por moeda), com fuso e moeda proprios.

## O que ainda nao esta

- Google Ads, TikTok Ads e Kwai: o schema e a atribuicao ja sao multi-plataforma
  (`ad_insights.platform`), falta o cliente de API de cada uma. So a Meta sincroniza.
- Motor de regras automatizadas (pausar anuncio por CPA/ROAS): a tabela `rules` existe,
  o executor nao.
- Tela de CRUD dos pixels: a API (`/api/integrations/pixels`) esta pronta, a tela nao.

## Um aviso sobre os adapters

Os normalizadores foram escritos a partir do formato publico de cada gateway e sao
defensivos (procuram o mesmo campo em varios caminhos), mas nao foram validados
contra um payload real de producao. O payload cru fica salvo em `orders.raw` — se
algum campo vier em outro lugar, da pra ver ali e ajustar em um lugar so.
