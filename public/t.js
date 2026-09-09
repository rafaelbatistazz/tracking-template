/*!
 * Script de tracking.
 *
 * Uso na landing / pagina de vendas:
 *   <script src="https://SEU-DOMINIO/t.js" data-id="ID_DO_DASHBOARD" defer></script>
 *
 * O que ele faz, em ordem:
 *   1. le as UTMs e os click ids (fbclid/gclid/ttclid) da URL;
 *   2. guarda em localStorage + cookie no dominio raiz, com janela de atribuicao;
 *   3. carimba TODOS os links da pagina com essas UTMs, pra elas atravessarem
 *      ate o checkout (e voltarem pra gente no webhook do gateway);
 *   4. manda page_view e initiate_checkout pro coletor.
 */
(function () {
  'use strict'
  if (window.__tracker__) return
  window.__tracker__ = true

  var tag =
    document.currentScript ||
    (function () {
      var s = document.querySelectorAll('script[data-id]')
      return s[s.length - 1]
    })()
  if (!tag) return

  var DASHBOARD = tag.getAttribute('data-id')
  if (!DASHBOARD) return

  var ENDPOINT = tag.getAttribute('data-endpoint') || new URL(tag.src, location.href).origin
  var WINDOW_DAYS = parseInt(tag.getAttribute('data-window') || '30', 10)
  var MODEL = tag.getAttribute('data-model') || 'last' // last | first
  var STORE = '_rt_attr'
  var VISITOR = '_rt_vid'
  var SESSION = '_rt_sid'
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck']
  var CLICK_KEYS = ['fbclid', 'gclid', 'ttclid']

  /* ---------------- utilidades ---------------- */

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }

  /** Dominio raiz, pra o cookie valer em www., checkout., pay. etc. */
  function rootDomain() {
    var parts = location.hostname.split('.')
    if (parts.length <= 2) return location.hostname
    // co.uk, com.br: mantem 3 rotulos
    var twoLevel = /^(com|net|org|gov|edu|co)\.[a-z]{2}$/i
    return twoLevel.test(parts.slice(-2).join('.')) ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
  }

  function setCookie(name, value, days) {
    var d = new Date()
    d.setTime(d.getTime() + days * 864e5)
    var base = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax'
    document.cookie = base + ';domain=.' + rootDomain()
    document.cookie = base
  }

  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
    return m ? decodeURIComponent(m.pop()) : null
  }

  function lsGet(k) {
    try {
      return localStorage.getItem(k)
    } catch (e) {
      return null
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch (e) {}
  }

  function readStore() {
    var raw = lsGet(STORE) || getCookie(STORE)
    if (!raw) return null
    try {
      var obj = JSON.parse(raw)
      if (!obj || !obj.ts) return null
      if (Date.now() - obj.ts > WINDOW_DAYS * 864e5) return null // expirou a janela
      return obj
    } catch (e) {
      return null
    }
  }

  function writeStore(obj) {
    var raw = JSON.stringify(obj)
    lsSet(STORE, raw)
    setCookie(STORE, raw, WINDOW_DAYS)
  }

  /* ---------------- identidade ---------------- */

  var visitorId = lsGet(VISITOR) || getCookie(VISITOR)
  if (!visitorId) {
    visitorId = uuid()
    lsSet(VISITOR, visitorId)
  }
  setCookie(VISITOR, visitorId, 365)

  var sessionId = sessionStorage.getItem(SESSION)
  if (!sessionId) {
    sessionId = uuid()
    try {
      sessionStorage.setItem(SESSION, sessionId)
    } catch (e) {}
  }

  /* ---------------- captura de atribuicao ---------------- */

  var url = new URL(location.href)
  var incoming = {}
  var hasIncoming = false

  UTM_KEYS.concat(CLICK_KEYS).forEach(function (k) {
    var v = url.searchParams.get(k)
    if (v) {
      incoming[k] = v
      hasIncoming = true
    }
  })

  var stored = readStore()
  var attr

  if (hasIncoming && (MODEL === 'last' || !stored)) {
    // Clique novo: sobrescreve (last click) ou grava o primeiro (first click).
    attr = incoming
    attr.ts = Date.now()
    attr.landing = location.href
    attr.referrer = document.referrer || null
    writeStore(attr)
  } else if (stored) {
    attr = stored
  } else {
    attr = { ts: Date.now(), landing: location.href, referrer: document.referrer || null }
    writeStore(attr)
  }

  /* _fbc / _fbp: o pixel da Meta cria, mas se o usuario chegou com fbclid e o
     pixel ainda nao rodou, a gente monta o _fbc pra nao perder a atribuicao. */
  var fbp = getCookie('_fbp')
  var fbc = getCookie('_fbc')
  if (!fbc && attr.fbclid) {
    fbc = 'fb.1.' + Date.now() + '.' + attr.fbclid
    setCookie('_fbc', fbc, 90)
  }

  /* ---------------- carimbo nos links ---------------- */

  function paramsToAppend() {
    var out = {}
    UTM_KEYS.forEach(function (k) {
      if (attr[k]) out[k] = attr[k]
    })
    CLICK_KEYS.forEach(function (k) {
      if (attr[k]) out[k] = attr[k]
    })
    out.rt_vid = visitorId
    return out
  }

  function decorate(href) {
    if (!href) return href
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return href
    var u
    try {
      u = new URL(href, location.href)
    } catch (e) {
      return href
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return href

    var add = paramsToAppend()
    Object.keys(add).forEach(function (k) {
      // nao sobrescreve o que ja foi posto na mao no link
      if (!u.searchParams.get(k)) u.searchParams.set(k, add[k])
    })
    return u.toString()
  }

  function decorateAll(root) {
    var links = (root || document).querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      var a = links[i]
      if (a.__rt) continue
      a.__rt = 1
      var next = decorate(a.getAttribute('href'))
      if (next) a.setAttribute('href', next)
    }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn)
    else fn()
  }

  ready(function () {
    decorateAll(document)
    // paginas com conteudo dinamico (React, popups de checkout) inserem links depois
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes
          for (var j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1) decorateAll(added[j])
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true })
    }
  })

  /* ---------------- envio de eventos ---------------- */

  function send(type, extra) {
    var body = {
      dashboardId: DASHBOARD,
      type: type,
      visitorId: visitorId,
      sessionId: sessionId,
      url: location.href,
      referrer: document.referrer || null,
      landing: attr.landing || null,
      eventId: uuid(),
      fbp: fbp || null,
      fbc: fbc || null,
      utms: {
        src: attr.src || null,
        sck: attr.sck || null,
        utm_source: attr.utm_source || null,
        utm_medium: attr.utm_medium || null,
        utm_campaign: attr.utm_campaign || null,
        utm_content: attr.utm_content || null,
        utm_term: attr.utm_term || null,
      },
      clickIds: { fbclid: attr.fbclid || null, gclid: attr.gclid || null, ttclid: attr.ttclid || null },
      screen: screen.width + 'x' + screen.height,
      lang: navigator.language,
    }
    if (extra) for (var k in extra) body[k] = extra[k]

    var json = JSON.stringify(body)
    var endpoint = ENDPOINT + '/api/collect'
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([json], { type: 'application/json' }))
        return
      }
    } catch (e) {}
    fetch(endpoint, { method: 'POST', body: json, headers: { 'Content-Type': 'application/json' }, keepalive: true, mode: 'cors' }).catch(
      function () {}
    )
  }

  send('page_view')

  /* ---------------- InitiateCheckout ---------------- */

  var config = null
  fetch(ENDPOINT + '/api/pixel-config?id=' + encodeURIComponent(DASHBOARD))
    .then(function (r) {
      return r.json()
    })
    .then(function (c) {
      config = c
    })
    .catch(function () {})

  function matches(el, rule) {
    if (!rule || !rule.type || !rule.value) return false
    var value = String(rule.value).toLowerCase()
    if (rule.type === 'button_text_match') {
      return (el.innerText || el.textContent || '').toLowerCase().indexOf(value) !== -1
    }
    if (rule.type === 'button_css_match') {
      try {
        return el.matches(rule.value) || !!el.closest(rule.value)
      } catch (e) {
        // valor pode ser so uma classe solta ("IC - Geral")
        return (el.className || '').toLowerCase().indexOf(value) !== -1
      }
    }
    if (rule.type === 'button_url_match') {
      var href = el.getAttribute && el.getAttribute('href')
      return !!href && href.toLowerCase().indexOf(value) !== -1
    }
    return false
  }

  document.addEventListener(
    'click',
    function (ev) {
      if (!config) return
      var el = ev.target
      for (var depth = 0; el && depth < 6; depth++, el = el.parentElement) {
        if (config.initiateCheckout && matches(el, config.initiateCheckout)) {
          send('initiate_checkout', { label: (el.innerText || '').slice(0, 80) })
          return
        }
        if (config.addToCart && matches(el, config.addToCart)) {
          send('add_to_cart', { label: (el.innerText || '').slice(0, 80) })
          return
        }
        if (config.lead && matches(el, config.lead)) {
          send('lead', { label: (el.innerText || '').slice(0, 80) })
          return
        }
      }
    },
    true
  )

  /* ---------------- API publica ---------------- */

  // API publica, pra disparar evento na mao: Tracker.track('lead')
  window.Tracker = {
    visitorId: visitorId,
    sessionId: sessionId,
    attribution: attr,
    track: function (type, extra) {
      send(type, extra)
    },
    decorate: decorate,
  }
})()
