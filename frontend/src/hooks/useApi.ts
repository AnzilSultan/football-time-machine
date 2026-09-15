import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'

interface State<T> { data: T | null; error: ApiError | Error | null; loading: boolean }

/** Fetch wrapper with stale-response protection; keeps previous data while reloading for smooth transitions. */
export function useApi<T>(fetcher: (() => Promise<T>) | null, deps: unknown[]): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!fetcher })
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  useEffect(() => {
    if (!fetcher) { setState({ data: null, error: null, loading: false }); return }
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher().then(
      (data) => { if (seq.current === id) setState({ data, error: null, loading: false }) },
      (error) => { if (seq.current === id) setState((s) => ({ data: s.data, error, loading: false })) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}

export function useDebounce<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const h = () => setM(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return m
}

export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ width: Math.round(r.width), height: Math.round(r.height) })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}
