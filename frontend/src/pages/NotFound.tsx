import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/primitives'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="eyebrow">404</div>
      <h1 className="display text-3xl">This page is off the pitch</h1>
      <p className="max-w-md text-sm text-fg-muted">The route you requested does not exist. Head back to the landing page or pick one of the three experiences.</p>
      <Link to="/"><Button variant="primary">Back to Football Time Machine</Button></Link>
    </div>
  )
}
