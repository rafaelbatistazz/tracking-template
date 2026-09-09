/**
 * Traducao de UTMs -> objetos de anuncio.
 *
 * O padrao (o mesmo que as ferramentas de tracking pedem pra voce colar no campo
 * "Parametros de URL" do anuncio) coloca nome e id juntos, separados por "|":
 *
 *   utm_source=FB
 *   utm_campaign={{campaign.name}}|{{campaign.id}}
 *   utm_medium={{adset.name}}|{{adset.id}}
 *   utm_content={{ad.name}}|{{ad.id}}
 *   utm_term={{placement}}
 *   src={{site_source_name}}
 *
 * E dai que sai a atribuicao: o gateway devolve essas UTMs no webhook, a gente
 * arranca o id de dentro e cruza com o gasto que veio da API da plataforma.
 */

export type TrafficSource = 'meta' | 'google' | 'tiktok' | 'kwai' | 'organic' | 'other'

export type Utms = {
  src?: string | null
  sck?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
}

export type ParsedAdRef = {
  trafficSource: TrafficSource
  accountId: string | null
  campaignId: string | null
  adsetId: string | null
  adId: string | null
  campaignName: string | null
  adsetName: string | null
  adName: string | null
}

const ID_RE = /^\d{6,}$/

/** "Campanha Frio 01|120210987654320123" -> { name, id } */
export function splitNameId(value?: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null }
  const raw = decodeURIComponent(String(value).replace(/\+/g, ' ')).trim()
  if (!raw) return { name: null, id: null }

  const cut = raw.lastIndexOf('|')
  if (cut === -1) {
    // Sem separador: pode ser so o id, ou so o nome.
    return ID_RE.test(raw) ? { name: null, id: raw } : { name: raw, id: null }
  }

  const name = raw.slice(0, cut).trim() || null
  const tail = raw.slice(cut + 1).trim()
  // Placeholders nao substituidos ({{campaign.id}}) entram como texto: descarta.
  return { name, id: ID_RE.test(tail) ? tail : null }
}

export function detectTrafficSource(utms: Utms, clickIds?: { fbclid?: string | null; gclid?: string | null; ttclid?: string | null }): TrafficSource {
  const s = (utms.utm_source || utms.src || '').toLowerCase()

  if (clickIds?.fbclid) return 'meta'
  if (clickIds?.gclid) return 'google'
  if (clickIds?.ttclid) return 'tiktok'

  if (/\b(fb|face|facebook|ig|instagram|meta)\b/.test(s)) return 'meta'
  if (/\b(google|adwords|gads|youtube|yt)\b/.test(s)) return 'google'
  if (/\b(tiktok|tt|ttads)\b/.test(s)) return 'tiktok'
  if (/\b(kwai|kwaiads)\b/.test(s)) return 'kwai'
  if (!s) return 'organic'
  return 'other'
}

export function parseAdRef(utms: Utms, clickIds?: { fbclid?: string | null; gclid?: string | null; ttclid?: string | null }): ParsedAdRef {
  const trafficSource = detectTrafficSource(utms, clickIds)

  const campaign = splitNameId(utms.utm_campaign)
  const adset = splitNameId(utms.utm_medium)
  const ad = splitNameId(utms.utm_content)

  return {
    trafficSource,
    accountId: null, // resolvido depois, via ad_objects (o id do anuncio ja diz a conta)
    campaignId: campaign.id,
    adsetId: adset.id,
    adId: ad.id,
    campaignName: campaign.name,
    adsetName: adset.name,
    adName: ad.name,
  }
}

/** Le UTMs de uma querystring/URL qualquer. */
export function utmsFromUrl(url: string): Utms & { fbclid?: string; gclid?: string; ttclid?: string } {
  let qs: URLSearchParams
  try {
    qs = new URL(url).searchParams
  } catch {
    qs = new URLSearchParams(url.startsWith('?') ? url.slice(1) : url)
  }
  const get = (k: string) => qs.get(k) || undefined
  return {
    src: get('src'),
    sck: get('sck'),
    utm_source: get('utm_source'),
    utm_medium: get('utm_medium'),
    utm_campaign: get('utm_campaign'),
    utm_content: get('utm_content'),
    utm_term: get('utm_term'),
    fbclid: get('fbclid'),
    gclid: get('gclid'),
    ttclid: get('ttclid'),
  }
}

/** Modelo de URL pra colar no anuncio. E o que a tela de integracao mostra. */
export function urlParamsTemplate(platform: TrafficSource): string {
  switch (platform) {
    case 'meta':
      return [
        'utm_source=FB',
        'utm_campaign={{campaign.name}}|{{campaign.id}}',
        'utm_medium={{adset.name}}|{{adset.id}}',
        'utm_content={{ad.name}}|{{ad.id}}',
        'utm_term={{placement}}',
        'src={{site_source_name}}',
      ].join('&')
    case 'google':
      return [
        'utm_source=GOOGLE',
        'utm_campaign={campaignid}',
        'utm_medium={adgroupid}',
        'utm_content={creative}',
        'utm_term={keyword}',
      ].join('&')
    case 'tiktok':
      return [
        'utm_source=TIKTOK',
        'utm_campaign=__CAMPAIGN_NAME__|__CAMPAIGN_ID__',
        'utm_medium=__AID_NAME__|__AID__',
        'utm_content=__CID_NAME__|__CID__',
        'utm_term=__PLACEMENT__',
      ].join('&')
    default:
      return 'utm_source=&utm_campaign=&utm_medium=&utm_content=&utm_term='
  }
}
