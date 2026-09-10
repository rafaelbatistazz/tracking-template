'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Logo from '../components/logo'
import { AccountPicker, PanelProvider, RangePicker, usePanel } from '../components/ui'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/utms', label: 'UTMs' },
  { href: '/anuncios', label: 'Anuncios' },
  { href: '/pedidos', label: 'Pedidos' },
  { href: '/integracoes', label: 'Integracoes' },
]

function Header({ comPeriodo }: { comPeriodo: boolean }) {
  const { dashboards, dashboardId, setDashboardId } = usePanel()

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {dashboards.length > 1 && (
        <select value={dashboardId} onChange={(e) => setDashboardId(e.target.value)}
                className="bg-panel border border-line rounded-lg px-3 py-1.5 text-sm">
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      )}
      {comPeriodo && <AccountPicker />}
      {comPeriodo && <RangePicker />}
    </div>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={onNavigate}
              className={`block px-3 py-2 rounded-lg text-sm ${pathname === n.href ? 'bg-brand/15 text-white' : 'text-muted hover:text-white hover:bg-panel'}`}>
          {n.label}
        </Link>
      ))}
    </nav>
  )
}

/** Hamburguer + gaveta com a mesma navegacao da barra lateral, pra telas < md. */
function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}
                className="w-9 h-9 grid place-items-center rounded-lg border border-line text-muted hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-ink border-r border-line p-4 overflow-y-auto">
            <div className="mb-8"><Logo /></div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <PanelProvider>
      <div className="flex min-h-screen">
        <aside className="w-52 shrink-0 border-r border-line p-4 hidden md:block">
          <div className="mb-8">
            <Logo />
          </div>
          <NavLinks pathname={pathname} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <MobileNav pathname={pathname} />

          <main className="flex-1 p-4 md:p-6 min-w-0">
            <Header comPeriodo={pathname !== '/integracoes'} />
            {children}
          </main>
        </div>
      </div>
    </PanelProvider>
  )
}
