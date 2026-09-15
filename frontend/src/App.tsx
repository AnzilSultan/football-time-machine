import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/layout/Shell'
import { Skeleton } from '@/components/ui/primitives'

const Landing = lazy(() => import('@/pages/Landing'))
const EraTranslator = lazy(() => import('@/pages/EraTranslator'))
const PlayerDNA = lazy(() => import('@/pages/PlayerDNA'))
const TimeMachine = lazy(() => import('@/pages/TimeMachine'))
const EraMap = lazy(() => import('@/pages/EraMap'))
const Compare = lazy(() => import('@/pages/Compare'))
const MLLab = lazy(() => import('@/pages/MLLab'))
const DataPages = lazy(() => import('@/pages/Data'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function PageFallback() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Suspense fallback={<PageFallback />}><Landing /></Suspense>} />
        <Route path="era-translator" element={<Suspense fallback={<PageFallback />}><EraTranslator /></Suspense>} />
        <Route path="dna" element={<Suspense fallback={<PageFallback />}><PlayerDNA /></Suspense>} />
        <Route path="dna/:playerId" element={<Suspense fallback={<PageFallback />}><PlayerDNA /></Suspense>} />
        <Route path="time-machine" element={<Suspense fallback={<PageFallback />}><TimeMachine /></Suspense>} />
        <Route path="era-map" element={<Suspense fallback={<PageFallback />}><EraMap /></Suspense>} />
        <Route path="compare" element={<Suspense fallback={<PageFallback />}><Compare /></Suspense>} />
        <Route path="ml-lab" element={<Suspense fallback={<PageFallback />}><MLLab /></Suspense>} />
        <Route path="data" element={<Suspense fallback={<PageFallback />}><DataPages /></Suspense>} />
        <Route path="data/:tab" element={<Suspense fallback={<PageFallback />}><DataPages /></Suspense>} />
        <Route path="players/:playerId" element={<RedirectPlayer />} />
        <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
      </Route>
    </Routes>
  )
}

function RedirectPlayer() {
  const id = window.location.pathname.split('/').pop()
  return <Navigate to={`/dna/${id}`} replace />
}
