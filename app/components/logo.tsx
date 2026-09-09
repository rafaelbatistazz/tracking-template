import { APP_NAME } from '@/lib/brand'

/**
 * Marca grafica do painel. Enquanto NEXT_PUBLIC_APP_NAME nao for definido,
 * aparece so o simbolo — nenhum nome inventado no lugar do seu.
 */
export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-lg bg-brand shrink-0 grid place-items-center">
        <span className="w-2.5 h-2.5 rounded-sm bg-ink" />
      </span>
      {APP_NAME && <span className="text-lg font-bold tracking-tight truncate">{APP_NAME}</span>}
    </div>
  )
}
