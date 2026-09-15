import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, User, Shield, Calendar, Trophy, CornerDownLeft } from 'lucide-react'
import { getSearch, type SearchResult } from '@/lib/api'
import { useDebounce } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

const ICON = { player: User, team: Shield, season: Calendar, competition: Trophy }

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [active, setActive] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const dq = useDebounce(q, 160)
  const nav = useNavigate()

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
      if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  React.useEffect(() => {
    if (!dq.trim()) { setResults([]); return }
    let alive = true
    setLoading(true)
    getSearch(dq).then((r) => { if (alive) { setResults(r.results); setActive(0) } }).catch(() => { if (alive) setResults([]) }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [dq])

  const go = (r: SearchResult) => {
    setOpen(false); setQ('')
    if (r.type === 'player') nav(`/dna/${r.id}`)
    else if (r.type === 'season') nav(`/time-machine?season=${encodeURIComponent(String(r.id))}`)
    else if (r.type === 'competition') nav(`/time-machine?competition=${encodeURIComponent(String(r.id))}`)
    else nav(`/era-map?team=${encodeURIComponent(r.label)}`)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg" aria-label="Open search">
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search players, teams, seasons</span>
          <kbd className="ml-2 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-dim sm:inline">⌘K</kbd>
        </button>
      </Dialog.Trigger>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/60"
                initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}>
                <Dialog.Title className="sr-only">Search</Dialog.Title>
                <div className="flex items-center gap-3 border-b border-border px-4">
                  <Search className="h-4 w-4 text-fg-dim" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players, teams, seasons, competitions…" aria-label="Search"
                    className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-dim"
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                      if (e.key === 'Enter' && results[active]) go(results[active])
                    }} />
                  {loading && <span className="h-2 w-2 animate-pulse rounded-full bg-pitch" aria-hidden="true" />}
                </div>
                <ul role="listbox" aria-label="Search results" className="max-h-[50vh] overflow-y-auto p-2">
                  <AnimatePresence initial={false}>
                    {results.map((r, i) => {
                      const Icon = ICON[r.type]
                      return (
                        <motion.li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16, delay: i * 0.015 }}
                          onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                          className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm', i === active ? 'bg-white/[0.06] text-fg' : 'text-fg-muted')}>
                          <Icon className={cn('h-4 w-4 shrink-0', r.type === 'player' ? 'text-pitch' : r.type === 'season' ? 'text-gold' : 'text-fg-dim')} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-fg">{r.label}</div>
                            <div className="truncate text-xs text-fg-dim">{r.sublabel}</div>
                          </div>
                          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-dim">{r.type}</span>
                          {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-fg-dim" />}
                        </motion.li>
                      )
                    })}
                  </AnimatePresence>
                  {!results.length && (
                    <li className="px-3 py-8 text-center text-xs text-fg-dim">{q.trim() ? (loading ? 'Searching…' : 'No matches in the dataset') : 'Try “Messi”, “Xavi”, “Barcelona” or “World Cup 2022”'}</li>
                  )}
                </ul>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
