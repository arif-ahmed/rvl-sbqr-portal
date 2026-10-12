// Local-only helper: render an ISO timestamp as "12 min ago" / "3 h ago" /
// "2 d ago". Kept in this folder because the rest of the portal has no other
// need for it; lifting it to shared/format is a refactor for when a second
// surface asks. SSR-safe: Intl.RelativeTimeFormat is available in Node 18+
// and all current browsers.

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "12 min ago" / "3 h ago" / "2 d ago" / "just now". Returns "" for null. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((then - now.getTime()) / 1000)
  // Future timestamps (clock skew) collapse to "just now" rather than "in 0 sec".
  if (Math.abs(diffSec) < 45) return 'just now'
  const abs = Math.abs(diffSec)
  if (abs < 60) return RTF.format(diffSec, 'second')
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return RTF.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 604_800) return RTF.format(Math.round(diffSec / 86_400), 'day')
  if (abs < 2_592_000) return RTF.format(Math.round(diffSec / 604_800), 'week')
  if (abs < 31_536_000) return RTF.format(Math.round(diffSec / 2_592_000), 'month')
  return RTF.format(Math.round(diffSec / 31_536_000), 'year')
}
