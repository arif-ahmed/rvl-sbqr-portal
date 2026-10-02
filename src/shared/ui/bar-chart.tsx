export type BarDatum = { label: string; a: number; b: number; draft?: boolean }

const compact = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k` : String(Math.round(n))

const niceTop = (max: number) => {
  const step = 10 ** Math.max(0, String(Math.round(max)).length - 2)
  return Math.ceil(max / 4 / step) * step * 4 || 1
}

/** Stacked bars: `a` (e.g. generations, lighter) on top of `b` (e.g. validations, solid). Draft months are faded. */
export function BarChart(props: { data: BarDatum[]; label: string; aName?: string; bName?: string }) {
  const { data, label, aName = 'Generations', bName = 'Validations' } = props
  const W = 640, H = 230, pl = 48, pr = 8, pt = 12, pb = 28
  const iw = W - pl - pr
  const ih = H - pt - pb
  const top = niceTop(Math.max(...data.map((d) => d.a + d.b), 1))
  const bw = Math.min(54, (iw / data.length) * 0.52)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} className="block">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = pt + ih - (ih * i) / 4
        return (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke="var(--line)" strokeDasharray={i ? '3 4' : undefined} />
            <text x={pl - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">
              {compact((top * i) / 4)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const cx = pl + (iw / data.length) * (i + 0.5)
        const hb = (ih * d.b) / top
        const ha = (ih * d.a) / top
        return (
          <g key={d.label} opacity={d.draft ? 0.55 : 1}>
            <title>{`${d.label}: ${aName} ${d.a.toLocaleString('en-US')}, ${bName} ${d.b.toLocaleString('en-US')}`}</title>
            <rect x={cx - bw / 2} y={pt + ih - hb} width={bw} height={hb} rx="3" fill="var(--accent)" />
            <rect x={cx - bw / 2} y={pt + ih - hb - ha} width={bw} height={ha} rx="3" fill="var(--accent)" opacity="0.4" />
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="11.5" fill="var(--text-3)">
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
