import * as React from 'react'
import * as d3 from 'd3'
import { useReducedMotion } from 'framer-motion'
import { useElementSize } from '@/hooks/useApi'
import type { MapPoint } from '@/lib/api'
import { clusterColor } from '@/lib/utils'

export interface ScatterMapProps {
  points: MapPoint[]
  colorOf?: (p: MapPoint) => string
  highlightId?: string | null
  dimmed?: (p: MapPoint) => boolean
  onSelect?: (p: MapPoint | null) => void
  onHover?: (p: MapPoint | null) => void
  height?: number
  radius?: number
  axisLabels?: [string, string]
  labelled?: (p: MapPoint) => boolean
}

/** D3-driven PCA scatter with zoom/pan, hover, click and animated position transitions. */
export function ScatterMap({ points, colorOf, highlightId, dimmed, onSelect, onHover, height = 520, radius = 4, axisLabels, labelled }: ScatterMapProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>()
  const svgRef = React.useRef<SVGSVGElement>(null)
  const gRef = React.useRef<SVGGElement>(null)
  const reduce = useReducedMotion()
  const zoomRef = React.useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const color = colorOf ?? ((p: MapPoint) => clusterColor(p.cluster))
  const width = size.width || 800
  const margin = { top: 16, right: 16, bottom: 32, left: 40 }

  const scales = React.useMemo(() => {
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
    const pad = 0.6
    const x = d3.scaleLinear().domain([(d3.min(xs) ?? -1) - pad, (d3.max(xs) ?? 1) + pad]).range([margin.left, width - margin.right])
    const y = d3.scaleLinear().domain([(d3.min(ys) ?? -1) - pad, (d3.max(ys) ?? 1) + pad]).range([height - margin.bottom, margin.top])
    return { x, y }
  }, [points, width, height]) // eslint-disable-line react-hooks/exhaustive-deps

  // zoom behaviour
  React.useEffect(() => {
    const svg = d3.select(svgRef.current!)
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.7, 12]).on('zoom', (ev) => {
      zoomRef.current = ev.transform
      d3.select(gRef.current!).attr('transform', ev.transform.toString())
      d3.select(gRef.current!).selectAll<SVGCircleElement, MapPoint>('circle').attr('r', radius / Math.sqrt(ev.transform.k))
      d3.select(gRef.current!).selectAll<SVGTextElement, MapPoint>('text.lbl').attr('font-size', 10 / Math.sqrt(ev.transform.k))
    })
    svg.call(zoom)
    svg.on('dblclick.zoom', null)
    svg.on('dblclick', () => svg.transition().duration(reduce ? 0 : 500).call(zoom.transform, d3.zoomIdentity))
    return () => { svg.on('.zoom', null) }
  }, [radius, reduce])

  // draw / update points
  React.useEffect(() => {
    const g = d3.select(gRef.current!)
    const t = g.transition().duration(reduce ? 0 : 650).ease(d3.easeCubicOut)
    const k = zoomRef.current.k
    const sel = g.selectAll<SVGCircleElement, MapPoint>('circle').data(points, (d) => d.id)
    sel.exit().transition(t as never).attr('r', 0).remove()
    const enter = sel.enter().append('circle')
      .attr('cx', (d) => scales.x(d.x)).attr('cy', (d) => scales.y(d.y)).attr('r', 0)
      .attr('tabindex', -1)
      .on('mouseenter', (_, d) => onHover?.(d)).on('mouseleave', () => onHover?.(null))
      .on('click', (ev, d) => { ev.stopPropagation(); onSelect?.(d) })
    enter.append('title').text((d) => `${d.label}${d.season_key ? ' · ' + d.season_key : ''}`)
    const all = enter.merge(sel)
    all.style('cursor', 'pointer')
    all.transition(t as never)
      .attr('cx', (d) => scales.x(d.x)).attr('cy', (d) => scales.y(d.y))
      .attr('r', (d) => (d.id === highlightId ? radius * 2.2 : radius) / Math.sqrt(k))
      .attr('fill', (d) => color(d))
      .attr('fill-opacity', (d) => (dimmed?.(d) ? 0.08 : d.id === highlightId ? 1 : 0.75))
      .attr('stroke', (d) => (d.id === highlightId ? '#fff' : 'none')).attr('stroke-width', 1.5 / Math.sqrt(k))
    if (highlightId) all.filter((d) => d.id === highlightId).raise()
    // labels
    const lab = g.selectAll<SVGTextElement, MapPoint>('text.lbl').data(points.filter((p) => labelled?.(p) || p.id === highlightId), (d) => d.id)
    lab.exit().remove()
    const labEnter = lab.enter().append('text').attr('class', 'lbl').attr('font-size', 10 / Math.sqrt(k)).attr('fill', '#f4f4f2').attr('pointer-events', 'none').attr('dx', 6).attr('dy', 3)
    labEnter.merge(lab).text((d) => d.label).transition(t as never).attr('x', (d) => scales.x(d.x)).attr('y', (d) => scales.y(d.y))
      .attr('opacity', (d) => (dimmed?.(d) ? 0.2 : 0.9))
  }, [points, scales, highlightId, dimmed, color, onHover, onSelect, radius, reduce, labelled])

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      <svg ref={svgRef} width={width} height={height} className="block touch-none rounded-lg bg-bg-elev" role="img"
        aria-label="Interactive PCA scatter map. Use the search or list to inspect individual points." onClick={() => onSelect?.(null)}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" /></pattern>
        </defs>
        <rect x={margin.left} y={margin.top} width={Math.max(0, width - margin.left - margin.right)} height={Math.max(0, height - margin.top - margin.bottom)} fill="url(#grid)" />
        <line x1={scales.x(0)} x2={scales.x(0)} y1={margin.top} y2={height - margin.bottom} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
        <line y1={scales.y(0)} y2={scales.y(0)} x1={margin.left} x2={width - margin.right} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
        <g ref={gRef} />
        {axisLabels && (
          <>
            <text x={width - margin.right} y={height - 10} textAnchor="end" fill="#6f736e" fontSize={10}>{axisLabels[0]} →</text>
            <text x={12} y={margin.top + 4} fill="#6f736e" fontSize={10} transform={`rotate(-90 12 ${margin.top + 4})`} textAnchor="end">{axisLabels[1]} →</text>
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-[10px] text-fg-dim">scroll to zoom · drag to pan · double-click to reset</div>
    </div>
  )
}
