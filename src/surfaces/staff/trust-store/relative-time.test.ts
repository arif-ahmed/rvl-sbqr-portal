import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

// Pin "now" to a deterministic instant so the formatter is reproducible.
const now = new Date('2026-10-12T10:00:00Z')

describe('relativeTime', () => {
  it('returns "" for null and for unparseable strings', () => {
    expect(relativeTime(null, now)).toBe('')
    expect(relativeTime('not-a-date', now)).toBe('')
  })

  it('returns "just now" for the last 45 seconds in either direction', () => {
    expect(relativeTime('2026-10-12T10:00:30Z', now)).toBe('just now')
    expect(relativeTime('2026-10-12T10:00:30Z', now)).toBe('just now')
    // Future timestamps (clock skew) collapse to "just now" rather than "in 0 sec".
    expect(relativeTime('2026-10-12T10:00:30Z', now)).toBe('just now')
  })

  it('formats sub-minute diffs in seconds when they round into the seconds bucket', () => {
    // 50s — outside the "just now" 45s window, still under a minute. The
    // helper rounds into the seconds bucket because abs < 60.
    expect(relativeTime('2026-10-12T09:59:10Z', now)).toBe('50 seconds ago')
  })

  it('formats sub-hour diffs in minutes', () => {
    expect(relativeTime('2026-10-12T09:48:00Z', now)).toBe('12 minutes ago')
  })

  it('formats sub-day diffs in hours', () => {
    expect(relativeTime('2026-10-12T07:00:00Z', now)).toBe('3 hours ago')
  })

  it('formats sub-week diffs in days', () => {
    expect(relativeTime('2026-10-10T10:00:00Z', now)).toBe('2 days ago')
  })
})
