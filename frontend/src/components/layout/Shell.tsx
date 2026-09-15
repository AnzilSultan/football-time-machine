import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import { TooltipProvider } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/era-translator', label: 'Era Translator' },
  { to: '/dna', label: 'Player DNA' },
  { to: '/time-machine', label: 'Time Machine' },
  { to: '/era-map', label: 'Era Map' },
  { to: '/compare', label: 'Compare' },
  { to: '/ml-lab', label: 'ML Lab' },
  { to: '/data', label: 'Data' },
]

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5" aria-label="Football Time Machine home">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#16181c" stroke="rgba(255,255,255,0.1)" /><circle cx="32" cy="32" r="18" fill="none" stroke="#2fbf71" strokeWidth="3" /><path d="M32 14v36M14 32h36" stroke="#2fbf71" strokeWidth="2" opacity=".5" /><circle cx="32" cy="32" r="4" fill="#d5b467" /></svg>
      <span className="hidden text-sm font-semibold tracking-tight sm:inline">Football Time Machine</span>
    </NavLink>
  )
}

export function Shell() {
  const loc = useLocation()
  const [open, setOpen] = React.useState(false)
  const reduce = useReducedMotion()
  React.useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }) }, [loc.pathname])
  return (
    <TooltipProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-pitch focus:px-3 focus:py-2 focus:text-black">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:px-6">
          <Logo />
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('relative rounded-md px-3 py-1.5 text-[13px] transition-colors', isActive ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                {({ isActive }) => (
                  <>
                    {n.label}
                    {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-px bg-pitch" transition={{ duration: 0.3 }} />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <button className="rounded-md p-2 text-fg-muted hover:text-fg lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav aria-label="Mobile" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden border-t border-border bg-bg lg:hidden">
              <div className="grid gap-1 p-3">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('rounded-md px-3 py-2.5 text-sm', isActive ? 'bg-white/[0.06] text-fg' : 'text-fg-muted')}>{n.label}</NavLink>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 md:px-6 md:pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={loc.pathname} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs text-fg-dim md:flex-row md:items-center md:justify-between md:px-6">
          <span>Football Time Machine · Understanding footballers, playing styles and football eras with machine learning.</span>
          <span>Data: <a href="https://github.com/statsbomb/open-data" className="underline decoration-fg-dim/40 underline-offset-2 hover:text-fg-muted" target="_blank" rel="noreferrer">StatsBomb Open Data</a> · Model estimates are hypothetical statistical comparisons, not predictions.</span>
        </div>
      </footer>
    </TooltipProvider>
  )
}
