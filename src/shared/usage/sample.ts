import { isBillable, type Meter, type UsageEvent, type Verdict } from './usage'

// Sample usage for the UI-only build. Seeded, so the same events appear on every load and in tests.
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const refPrefixes = ['INV', 'POS', 'ORD', 'BILL']

/** The Active institutions in the sample list, and the one the sample FI user belongs to. */
export const sampleInstitutionIds = ['inst-1', 'inst-2', 'inst-3']
export const sampleFiInstitutionId = 'inst-1'

function build(): UsageEvent[] {
  const rand = seeded(20261002)
  const events: UsageEvent[] = []
  let t = Date.UTC(2026, 9, 2, 10, 45)
  for (let i = 0; i < 260; i++) {
    t -= Math.round(1 + rand() * 9) * 60_000 * (rand() < 0.1 ? 18 : 1)
    const d = new Date(t)
    const x = rand()
    let meter: Meter
    let verdict: Verdict
    if (x < 0.16) {
      meter = 'GENERATION_STATIC'
      verdict = 'Generated'
    } else if (x < 0.52) {
      meter = 'GENERATION_DYNAMIC'
      verdict = 'Generated'
    } else {
      meter = 'VALIDATION'
      const y = rand()
      verdict = y < 0.86 ? 'Valid' : y < 0.95 ? 'Invalid' : y < 0.98 ? 'Indeterminate' : 'Error'
    }
    events.push({
      id: `ue_${(0x15888 - i * 3).toString(16).padStart(6, '0')}`,
      at: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      meter,
      verdict,
      billable: isBillable(meter, verdict),
      ref: `${refPrefixes[Math.floor(rand() * refPrefixes.length)]}-${10000 + Math.floor(rand() * 89999)}`,
      institutionId: sampleInstitutionIds[Math.floor(rand() * sampleInstitutionIds.length)],
    })
  }
  return events
}

export const sampleEvents: UsageEvent[] = build()
