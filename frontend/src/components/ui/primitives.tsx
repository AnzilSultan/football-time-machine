import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as SliderPrimitive from '@radix-ui/react-slider'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Check, ChevronDown, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------------ Button
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'subtle'; size?: 'sm' | 'md' | 'lg' }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'outline', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 select-none disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]',
      size === 'sm' && 'h-8 px-3 text-xs', size === 'md' && 'h-10 px-4 text-sm', size === 'lg' && 'h-12 px-6 text-base',
      variant === 'primary' && 'bg-pitch text-black hover:bg-[#3fd182] shadow-[0_0_0_1px_rgba(47,191,113,0.4)]',
      variant === 'outline' && 'border border-border text-fg hover:border-border-strong hover:bg-white/[0.03]',
      variant === 'ghost' && 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
      variant === 'subtle' && 'bg-white/[0.05] text-fg hover:bg-white/[0.08]',
      className,
    )}
    {...props}
  />
))
Button.displayName = 'Button'

// ------------------------------------------------------------------ Card
export function Card({ className, hover, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn('card p-5 md:p-6', hover && 'card-hover', className)} {...props}>{children}</div>
}

export function CardTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <h3 className="text-sm font-semibold tracking-tight text-fg">{children}</h3>
      {action}
    </div>
  )
}

// ------------------------------------------------------------------ Badge
export function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'gold' | 'blue' | 'red' | 'outline'; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap',
      tone === 'neutral' && 'bg-white/[0.06] text-fg-muted',
      tone === 'green' && 'bg-pitch-soft text-pitch',
      tone === 'gold' && 'bg-gold-soft text-gold',
      tone === 'blue' && 'bg-[rgba(106,168,255,0.14)] text-info',
      tone === 'red' && 'bg-[rgba(229,116,91,0.14)] text-danger',
      tone === 'outline' && 'border border-border text-fg-muted',
      className,
    )}>{children}</span>
  )
}

// ------------------------------------------------------------------ Skeleton
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

// ------------------------------------------------------------------ Select
export function Select<T extends string>({ value, onValueChange, options, placeholder, className, ariaLabel, disabled }: {
  value: T | undefined; onValueChange: (v: T) => void; options: { value: T; label: string; sublabel?: string; group?: string }[]
  placeholder?: string; className?: string; ariaLabel: string; disabled?: boolean
}) {
  const groups = Array.from(new Set(options.map((o) => o.group ?? '')))
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange as (v: string) => void} disabled={disabled}>
      <SelectPrimitive.Trigger aria-label={ariaLabel} className={cn(
        'inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-fg transition-colors hover:border-border-strong data-[placeholder]:text-fg-dim disabled:opacity-50',
        className,
      )}>
        <span className="truncate"><SelectPrimitive.Value placeholder={placeholder} /></span>
        <SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-fg-dim" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="z-50 max-h-[min(60vh,420px)] w-[var(--radix-select-trigger-width)] min-w-[220px] overflow-hidden rounded-lg border border-border bg-surface-2 shadow-2xl shadow-black/50 data-[state=open]:animate-[fadeIn_140ms_ease-out]">
          <SelectPrimitive.Viewport className="p-1">
            {groups.map((g) => (
              <SelectPrimitive.Group key={g}>
                {g && <SelectPrimitive.Label className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-widest text-fg-dim">{g}</SelectPrimitive.Label>}
                {options.filter((o) => (o.group ?? '') === g).map((o) => (
                  <SelectPrimitive.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm text-fg outline-none data-[highlighted]:bg-white/[0.06] data-[state=checked]:text-pitch">
                    <SelectPrimitive.ItemIndicator className="absolute left-2"><Check className="h-3.5 w-3.5" /></SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                    {o.sublabel && <span className="ml-auto pl-3 text-xs text-fg-dim">{o.sublabel}</span>}
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

// ------------------------------------------------------------------ Tabs
export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-surface p-1', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-fg-muted transition-all data-[state=active]:bg-white/[0.08] data-[state=active]:text-fg', className)} {...p} />
}
export const TabsContent = TabsPrimitive.Content

// ------------------------------------------------------------------ Slider
export function Slider({ value, onValueChange, min, max, step = 1, ariaLabel, marks, className }: {
  value: number; onValueChange: (v: number) => void; min: number; max: number; step?: number; ariaLabel: string; marks?: { value: number; label: string }[]; className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <SliderPrimitive.Root className="relative flex h-6 w-full touch-none select-none items-center" value={[value]} onValueChange={(v) => onValueChange(v[0])} min={min} max={max} step={step}>
        <SliderPrimitive.Track className="relative h-[3px] w-full grow rounded-full bg-white/[0.1]">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-pitch" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={ariaLabel} className="block h-4 w-4 rounded-full border-2 border-pitch bg-bg shadow transition-transform hover:scale-110 focus-visible:scale-110" />
      </SliderPrimitive.Root>
      {marks && (
        <div className="relative mt-1 h-4 text-[10px] text-fg-dim">
          {marks.map((m) => (
            <span key={m.value} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((m.value - min) / (max - min)) * 100}%` }}>{m.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Switch
export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} aria-label={label} className="relative h-5 w-9 rounded-full bg-white/[0.12] transition-colors data-[state=checked]:bg-pitch">
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label}
    </label>
  )
}

// ------------------------------------------------------------------ Tooltip
export const TooltipProvider = TooltipPrimitive.Provider
export function InfoTip({ text, children }: { text: React.ReactNode; children?: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>
        {children ?? <button type="button" aria-label="More information" className="inline-flex text-fg-dim hover:text-fg-muted"><Info className="h-3.5 w-3.5" /></button>}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-fg-muted shadow-xl">
          {text}
          <TooltipPrimitive.Arrow className="fill-surface-2" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ------------------------------------------------------------------ Motion helpers
export const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 1, 0.5, 1] as const } } }
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay, ease: [0.25, 1, 0.5, 1] }}>
      {children}
    </motion.div>
  )
}
