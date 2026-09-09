import type { Metadata } from 'next'
import { PAGE_TITLE } from '@/lib/brand'
import './globals.css'

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: 'Tracking e atribuicao de vendas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
