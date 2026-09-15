import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a number for display; never renders NaN / null as text. */
export function fmt(v: number | null | undefined, digits = 2, fallback = '—'): string {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return fallback
  return v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${v.toFixed(digits)}%`
}

export function ratio(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export function ordinal(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const r = Math.round(n)
  const s = ['th', 'st', 'nd', 'rd']
  const v = r % 100
  return r + (s[(v - 20) % 10] || s[v] || s[0])
}

export const ERA_COLORS: Record<string, string> = {
  'Pre-2000': '#d5b467',
  '2000s': '#c99e4c',
  'Early 2010s': '#8fb3d9',
  'Late 2010s': '#6aa8ff',
  '2020s': '#2fbf71',
}

export const CLUSTER_PALETTE = [
  '#2fbf71', '#d5b467', '#6aa8ff', '#e5745b', '#b58cff', '#4fd1c5', '#f2a65a', '#ff7ab6', '#9ad0ff', '#c6e377', '#ffd166', '#8ecae6',
]

export function clusterColor(i: number) {
  if (i < 0) return '#5b5f5a'
  return CLUSTER_PALETTE[i % CLUSTER_PALETTE.length]
}

export const POSITION_LABEL: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back', DM: 'Defensive midfielder', CM: 'Central midfielder',
  WM: 'Wide midfielder', AM: 'Attacking midfielder', W: 'Winger', ST: 'Striker',
}
export const GROUP_LABEL: Record<string, string> = { GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', AM: 'Attacking mids & wingers', FW: 'Forwards' }

export const SAMPLE_LABEL: Record<string, string> = {
  full_season: 'Full season', partial_season: 'Partial season', single_team_centric: 'Single-team sample', tournament: 'Tournament',
}
