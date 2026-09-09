'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Logo from '../components/logo'
import { PanelProvider, RangePicker, usePanel } from '../components/ui'

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
      {comPeriodo && <RangePicker />}
    </div>
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
          <nav className="space-y-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                    className={`block px-3 py-2 rounded-lg text-sm ${pathname === n.href ? 'bg-brand/15 text-white' : 'text-muted hover:text-white hover:bg-panel'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6 min-w-0">
          <Header comPeriodo={pathname !== '/integracoes'} />
          {children}
        </main>
      </div>
    </PanelProvider>
  )
}
