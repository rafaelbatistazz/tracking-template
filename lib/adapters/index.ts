import type { NormalizedOrder } from './base'
import { normalizeKirvano } from './kirvano'
import { normalizeCakto } from './cakto'
import { normalizeHotmart } from './hotmart'
import { normalizeGeneric } from './generic'

export type Platform = 'kirvano' | 'cakto' | 'hotmart' | 'generic'

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'kirvano', label: 'Kirvano' },
  { id: 'cakto', label: 'Cakto' },
  { id: 'hotmart', label: 'Hotmart' },
  { id: 'generic', label: 'Generico (qualquer gateway)' },
]

const MAP: Record<Platform, (p: any) => NormalizedOrder | null> = {
  kirvano: normalizeKirvano,
  cakto: normalizeCakto,
  hotmart: normalizeHotmart,
  generic: normalizeGeneric,
}

export function normalize(platform: string, payload: any): NormalizedOrder | null {
  const fn = MAP[platform as Platform]
  if (!fn) return null
  return fn(payload)
}

export * from './base'
