import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Search, User } from 'lucide-react'
import { getSearch, type SearchResult } from '@/lib/api'
import { useDebounce } from '@/hooks/useApi'
import { cn } from '@/lib/utils'

/** Inline player combobox used by Era Translator, DNA and Compare. Resolves to a StatsBomb player_id. */
export function PlayerPicker({ value, onChange, label = 'Player', className }: { value: { id: number; label: string } | null; onChange: (v: { id: number; label: string }) => void; label?: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [active, setActive] = React.useState(0)
  const dq = useDebounce(q, 150)
  React.useEffect(() => {
    if (!dq.trim()) { setResults([]); return }
    let alive = true
    getSearch(dq, 'player').then((r) => alive && setResults(r.results)).catch(() => alive && setResults([]))
    return () => { alive = false }
  }, [dq])
  const pick = (r: SearchResult) => { onChange({ id: Number(r.id), label: r.label }); setOpen(false); setQ('') }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button aria-label={`${label}: ${value?.label ?? 'choose a player'}`} className={cn('flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm transition-colors hover:border-border-strong', className)}>
          <User className="h-4 w-4 shrink-0 text-pitch" />
          <span className={cn('flex-1 truncate', !value && 'text-fg-dim')}>{value?.label ?? 'Choose a player'}</span>
          <ChevronDown className="h-4 w-4 text-fg-dim" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-lg border border-border bg-surface-2 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 text-fg-dim" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" aria-label="Search players" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-fg-dim"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter' && results[active]) pick(results[active])
              }} />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            <AnimatePresence initial={false}>
              {results.map((r, i) => (
                <motion.li key={r.id} role="option" aria-selected={i === active} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14, delay: i * 0.012 }}
                  onMouseEnter={() => setActive(i)} onClick={() => pick(r)} className={cn('cursor-pointer rounded-md px-3 py-2 text-sm', i === active ? 'bg-white/[0.06] text-fg' : 'text-fg-muted')}>
                  <div className="text-fg">{r.label}</div>
                  <div className="text-[11px] text-fg-dim">{r.sublabel}</div>
                </motion.li>
              ))}
            </AnimatePresence>
            {!results.length && <li className="px-3 py-6 text-center text-xs text-fg-dim">{q ? 'No players match' : 'Start typing to search 7,000+ players'}</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
