import { vi } from 'vitest'
import { authenticate, resetApiClient } from '../shared/api/client'
import type { OnboardingDto, OnboardingStepDto, StepCode, StepStatus, TenantDto } from '../surfaces/staff/institutions/api/types'
import { stepOrder } from '../surfaces/staff/institutions/api/types'
import type { CreateRateCardDto, RateCardDto } from '../surfaces/staff/rates/api/types'
import { FakeBilling } from './fake-billing'

// An in-memory stand-in for the platform admin API (rvl-secure-bqr-manager). It now serves
// both the tenant onboarding endpoints (docs/features/institution-onboarding/implementation-guide.md
// section 2) and the rate-cards endpoints (src/Modules/Billing/SBQR.Modules.Billing.Api/Controllers/RateCardsController.cs)
// so the staff screens can run end to end in jsdom. Every request goes through the real api
// client and TanStack Query.

type Tenant = Omit<TenantDto, 'hasRateCard' | 'onboarding'>

type Rec = {
  tenant: Tenant
  configSaved: boolean
  credential: { clientId: string } | null
  signingKey: boolean
  hasRateCard: boolean
  /** Per-tenant rate cards, newest EffectiveFrom first — matches the server's order. */
  rateCards: RateCardDto[]
  /** Whether the institution is in the trust directory. Activation needs it. */
  trust: boolean
}

export type Call = { method: string; path: string; body: unknown }

const jwt = (claims: object) => `h.${btoa(JSON.stringify(claims))}.s`
const adminJwt = jwt({ sub: 'platform-admin', scope: ['admin'] })
/** The moment every test runs at: early October 2026, Dhaka. September is the month that just ended. */
export const TEST_NOW = new Date('2026-10-06T04:00:00Z')
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number) => `${y}-${pad(m)}-01`
const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const nextMonth = (d = TEST_NOW) => {
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return monthOf(n)
}
let rateCardCounter = 0
const newRateCardId = () => `rc-${++rateCardCounter}-${Math.random().toString(36).slice(2, 10)}`

function tenant(id: string, name: string, code: string, status: string, contact: string, email: string, caps = { gen: true, val: true }): Tenant {
  return {
    tenantId: id,
    institutionName: name,
    institutionCode: code,
    institutionType: code.slice(0, 2),
    status,
    contactName: contact,
    contactEmail: email,
    contactPhone: null,
    address: null,
    isQrGenerationAllowed: caps.gen,
    isQrValidationAllowed: caps.val,
    isActive: status !== 'TERMINATED',
  }
}

// `blank` is a factory so every record starts with a fresh `rateCards` array —
// otherwise `rec.rateCards.unshift(...)` in `addRateCard` would mutate the shared
// reference and bleed across tests.
const blank = () => ({ configSaved: false, credential: null, signingKey: false, hasRateCard: false, rateCards: [] as RateCardDto[], trust: true })

const rateCard = (tenantId: string, effectiveFrom: string, generationRate: number, validationRate: number): RateCardDto => ({
  rateCardId: newRateCardId(),
  tenantId,
  effectiveFrom,
  generationRate,
  validationRate,
  currency: 'BDT',
  createdBy: 'platform:admin',
})

/** The institutions the list and detail tests expect (same ids and names as the old mock data). */
function seed(): Rec[] {
  const now = TEST_NOW
  const year = now.getFullYear()
  return [
    { ...blank(), tenant: tenant('inst-1', 'Shapla Commercial Bank', '000901', 'ACTIVE', 'Rafiq Ahmed', 'rafiq.ahmed@shaplabank.example'), configSaved: true, credential: { clientId: '000901-7c1d9e02' }, signingKey: true, hasRateCard: true, rateCards: [rateCard('inst-1', ymd(year, 1), 0.5, 0.125), rateCard('inst-1', `${nextMonth()}-01`, 0.45, 0.12)] },
    { ...blank(), tenant: tenant('inst-2', 'Karnaphuli Trust Bank', '000902', 'ACTIVE', 'Sabina Yasmin', 'sabina@karnaphulitrust.example'), configSaved: true, credential: { clientId: '000902-b40e5a11' }, signingKey: true, hasRateCard: true, rateCards: [rateCard('inst-2', ymd(year, 1), 0.5, 0.125)] },
    { ...blank(), tenant: tenant('inst-3', 'Teesta Digital Wallet', '022901', 'ACTIVE', 'Nusrat Jahan', 'nusrat@teestawallet.example', { gen: false, val: true }), configSaved: true, credential: { clientId: '022901-e93b6f48' }, signingKey: true },
    { ...blank(), tenant: tenant('inst-4', 'Surma Payments Ltd', '032901', 'PENDING', 'Jahid Hasan', 'jahid.hasan@surmapayments.example'), configSaved: true, credential: { clientId: '032901-3f9a1c20' } },
    { ...blank(), tenant: tenant('inst-5', 'Nilgiri Mercantile Bank', '000903', 'PENDING', 'Kamal Uddin', 'kamal.uddin@nilgirimercantile.example') },
    { ...blank(), tenant: tenant('inst-6', 'Chandra Settlement Services', '042901', 'SUSPENDED', 'Mizanur Rahman', 'mizan@chandrasettlement.example'), configSaved: true, credential: { clientId: '042901-52d7c0aa' }, signingKey: true },
    { ...blank(), tenant: tenant('inst-7', 'Doyel Co-operative Finance', '012901', 'TERMINATED', 'Farzana Akter', 'farzana@doyelfinance.example'), configSaved: true, credential: { clientId: '012901-9a08be37' }, signingKey: true },
  ]
}

const problem = (status: number, title: string, detail: string, extra: object = {}) => Response.json({ title, detail, status, ...extra }, { status })

export class FakeBackend {
  records: Rec[] = seed()
  calls: Call[] = []
  private counter = 0
  /** The billing and usage endpoints. Seed it directly: `backend.billing.addUsageCounts(...)`. */
  billing = new FakeBilling(
    (tenantId) => this.find(tenantId)?.rateCards ?? [],
    () => this.records.map((r) => r.tenant.tenantId),
    () => new Date(),
  )
  private token = adminJwt
  /** Credentials the token endpoint accepts once any are registered; with none, every sign-in succeeds. */
  private clients = new Map<string, { secret: string; token: string }>()
  /** Make the next `method path` request (path without query) fail with this status, once. */
  private failures = new Map<string, number>()

  failNext(method: string, path: string, status: number) {
    this.failures.set(`${method} ${path}`, status)
  }

  /** The requests made so far, e.g. `calls('POST')` for every write. */
  callsTo(method: string, pathPart?: string) {
    return this.calls.filter((c) => c.method === method && (!pathPart || c.path.includes(pathPart)))
  }

  find(id: string) {
    return this.records.find((r) => r.tenant.tenantId === id)
  }

  /** Register another institution (e.g. one the directory picker should grey out). */
  addTenant(code: string, name: string, status = 'ACTIVE') {
    this.records.unshift({ ...blank(), tenant: tenant(`added-${code}`, name, code, status, 'Ops Desk', 'ops@example.test') })
  }

  /** Seed a rate card directly into a tenant's list — tests use this to set up scenarios
   *  without going through the HTTP path; the API endpoints are exercised separately. */
  addRateCard(tenantId: string, effectiveFrom: string, generationRate: number, validationRate: number) {
    const rec = this.find(tenantId)
    if (!rec) throw new Error(`unknown tenant ${tenantId}`)
    const card: RateCardDto = { rateCardId: newRateCardId(), tenantId, effectiveFrom, generationRate, validationRate, currency: 'BDT', createdBy: 'platform:admin' }
    rec.rateCards.unshift(card)
    rec.hasRateCard = true
    return card
  }

  private statusOf(code: StepCode, r: Rec): StepStatus {
    const active = r.tenant.status === 'ACTIVE'
    switch (code) {
      case 'PROFILE':
        return 'COMPLETED'
      case 'CONFIGURATION':
        return r.configSaved || r.credential ? 'COMPLETED' : 'NOT_STARTED'
      case 'CREDENTIALS':
        return r.credential ? 'COMPLETED' : 'NOT_STARTED'
      case 'SIGNING_KEY':
        return r.signingKey ? 'COMPLETED' : 'NOT_STARTED'
      case 'REVIEW':
        return active ? 'COMPLETED' : 'NOT_STARTED'
    }
  }

  private steps(r: Rec): OnboardingStepDto[] {
    return stepOrder.map((code) => {
      const status = this.statusOf(code, r)
      return { code, status, required: true, completedAt: status === 'COMPLETED' ? inDays(0) : null, completedBy: status === 'COMPLETED' ? 'platform:admin' : null }
    })
  }

  private blockers(r: Rec) {
    return [
      ...(this.statusOf('CONFIGURATION', r) === 'COMPLETED' ? [] : [{ code: 'CONFIGURATION_MISSING', message: 'Configuration has not been saved.' }]),
      ...(r.credential ? [] : [{ code: 'CREDENTIAL_MISSING', message: 'No active API credential.' }]),
      ...(r.signingKey ? [] : [{ code: 'SIGNING_KEY_MISSING', message: 'No active signing key.' }]),
      ...(r.trust ? [] : [{ code: 'TRUST_ENTRY_MISSING', message: 'The institution is not in the trust directory.' }]),
    ]
  }

  onboarding(r: Rec): OnboardingDto {
    const steps = this.steps(r)
    const done = (s: OnboardingStepDto) => s.status === 'COMPLETED'
    const blockers = this.blockers(r)
    return {
      tenantId: r.tenant.tenantId,
      status: r.tenant.status,
      currentStep: steps.find((s) => !done(s))?.code ?? null,
      canActivate: blockers.length === 0 && r.tenant.status === 'PENDING',
      hasRateCard: r.hasRateCard,
      steps,
      blockers,
      configuration: { isQrGenerationAllowed: r.tenant.isQrGenerationAllowed, isQrValidationAllowed: r.tenant.isQrValidationAllowed },
      credential: r.credential ? { clientId: r.credential.clientId, status: 'ACTIVE', expiresAt: inDays(365) } : null,
      signingKey: r.signingKey ? { keyId: `${r.tenant.institutionCode}-key`, version: 1, status: 'ACTIVE' } : null,
    }
  }

  private dto(r: Rec): TenantDto {
    const o = this.onboarding(r)
    const pending = r.tenant.status === 'PENDING'
    return {
      ...r.tenant,
      hasRateCard: r.hasRateCard,
      onboarding: pending ? { completedSteps: o.steps.filter((s) => s.status === 'COMPLETED').length, totalSteps: o.steps.length, currentStep: o.currentStep } : null,
    }
  }

  handle(method: string, url: string, body: unknown): Response {
    const { pathname, search } = new URL(url, 'http://fake')
    const path = pathname + search
    this.calls.push({ method, path, body })
    const failure = this.failures.get(`${method} ${pathname}`)
    if (failure) {
      this.failures.delete(`${method} ${pathname}`)
      return problem(failure, 'Request failed', `Injected ${failure}.`)
    }
    const b = (body ?? {}) as { [k: string]: unknown }

    const billed = this.billing.handle(method, pathname, new URL(url, 'http://fake').searchParams, b)
    if (billed) return billed

    if (pathname === '/v1/admin/institutions') return new Response(null, { status: 404 }) // the picker falls back to its built-in list
    if (pathname === '/v1/admin/tenants' && method === 'GET') {
      const params = new URL(url, 'http://fake').searchParams
      const page = Number(params.get('page') ?? 1)
      const pageSize = Number(params.get('pageSize') ?? 20)
      const all = this.records.map((r) => this.dto(r))
      const items = all.slice((page - 1) * pageSize, page * pageSize)
      return Response.json({ items, page, pageSize, totalCount: all.length, hasMore: page * pageSize < all.length })
    }
    if (pathname === '/v1/admin/tenants' && method === 'POST') {
      if (this.records.some((r) => r.tenant.institutionCode === b.institutionCode)) return problem(409, 'Duplicate institution', 'An institution with this code is already registered.')
      const code = String(b.institutionCode)
      const t = tenant(`new-${++this.counter}`, String(b.institutionName), code, 'PENDING', String(b.contactName), String(b.contactEmail))
      t.contactPhone = (b.contactPhone as string) ?? null
      t.address = (b.address as string) ?? null
      this.records.unshift({ ...blank(), tenant: t })
      return Response.json(this.dto(this.records[0]), { status: 201 })
    }
    if (pathname === '/v1/crypto-keys' && method === 'POST') {
      const r = this.find(String(b.tenantId))
      if (!r) return problem(404, 'Tenant not found', 'No such tenant.')
      r.signingKey = true
      return Response.json({ tenantId: r.tenant.tenantId, status: 'ACTIVE' }, { status: 201 })
    }

    // Rate-cards endpoints (mirrors RateCardsController). The page fans GETs out per tenant,
    // POST creates one for a future Dhaka month, DELETE withdraws while the month has not started.
    if (pathname === '/v1/admin/billing/rate-cards' && method === 'GET') {
      const params = new URL(url, 'http://fake').searchParams
      const tenantId = params.get('tenantId') ?? ''
      const r = this.find(tenantId)
      if (!r) return problem(404, 'Tenant not found', 'No such tenant.')
      // Server already returns newest EffectiveFrom first; the seed keeps that order.
      return Response.json(r.rateCards)
    }
    if (pathname === '/v1/admin/billing/rate-cards' && method === 'POST') {
      const req = b as Partial<CreateRateCardDto>
      const tenantId = String(req.tenantId ?? '')
      const r = this.find(tenantId)
      if (!r) return problem(404, 'Tenant not found', 'No such tenant.')
      const effectiveFrom = String(req.effectiveFrom ?? '')
      // The server rejects an empty tenant, the wrong day, and a card present for that month.
      if (r.rateCards.some((c) => c.effectiveFrom === effectiveFrom)) {
        return problem(409, 'Rate card conflict', `tenant ${tenantId} already has a rate card for ${effectiveFrom.slice(0, 7)}.`)
      }
      const card: RateCardDto = {
        rateCardId: newRateCardId(),
        tenantId,
        effectiveFrom,
        generationRate: Number(req.generationRate),
        validationRate: Number(req.validationRate),
        currency: 'BDT',
        createdBy: String(req.createdBy ?? 'platform:admin'),
      }
      r.rateCards.unshift(card)
      r.hasRateCard = true
      return Response.json(card, { status: 201 })
    }
    const rcDelete = pathname.match(/^\/v1\/admin\/billing\/rate-cards\/([^/]+)$/)
    if (rcDelete && method === 'DELETE') {
      const cardId = rcDelete[1]
      for (const rec of this.records) {
        const idx = rec.rateCards.findIndex((c) => c.rateCardId === cardId)
        if (idx === -1) continue
        const card = rec.rateCards[idx]
        const today = ymd(new Date().getFullYear(), new Date().getMonth() + 1).slice(0, 7)
        if (card.effectiveFrom.slice(0, 7) <= today) {
          return problem(409, 'Rate card conflict', `rate card ${cardId} has already taken effect and cannot be withdrawn.`)
        }
        rec.rateCards.splice(idx, 1)
        rec.hasRateCard = rec.rateCards.length > 0
        return new Response(null, { status: 204 })
      }
      return problem(404, 'Rate card not found', `rate card ${cardId} does not exist.`)
    }

    const m = pathname.match(/^\/v1\/admin\/tenants\/([^/]+)(?:\/(.*))?$/)
    const r = m ? this.find(m[1]) : undefined
    if (!m || !r) return problem(404, 'Not found', 'No such tenant.')
    const sub = m[2] ?? ''
    const t = r.tenant

    if (sub === '' && method === 'GET') return Response.json(this.dto(r))
    if (sub === 'onboarding' && method === 'GET') return Response.json(this.onboarding(r))
    if (sub === 'configuration' && method === 'PATCH') {
      if (t.status !== 'PENDING') return problem(409, 'Invariant violation', 'Configuration can only be changed while the institution is Pending.')
      if (!b.isQrGenerationAllowed && !b.isQrValidationAllowed) return problem(400, 'Invalid configuration', 'At least one of QR generation / validation must be allowed.')
      t.isQrGenerationAllowed = !!b.isQrGenerationAllowed
      t.isQrValidationAllowed = !!b.isQrValidationAllowed
      r.configSaved = true
      return Response.json({ ok: true })
    }
    if (sub === 'tenant-configuration' && method === 'POST') {
      if (r.credential) return problem(409, 'Invariant violation', 'Tenant already has an active API client.')
      t.isQrGenerationAllowed = b.isQrGenerationAllowed !== false
      t.isQrValidationAllowed = b.isQrValidationAllowed !== false
      r.credential = { clientId: `${t.institutionCode}-ab12cd34` }
      return Response.json({ tenantId: t.tenantId, credentialId: 'cred-1', clientId: r.credential.clientId, clientSecret: 'fake-client-secret-0123456789', expiresAt: inDays(365) }, { status: 201 })
    }
    const lifecycle: { [action: string]: [from: string[], to: string] } = {
      activate: [['PENDING', 'SUSPENDED'], 'ACTIVE'],
      suspend: [['ACTIVE', 'PENDING'], 'SUSPENDED'],
      reactivate: [['SUSPENDED'], 'ACTIVE'],
      terminate: [['ACTIVE', 'PENDING', 'SUSPENDED'], 'TERMINATED'],
    }
    const step = lifecycle[sub]
    if (step && method === 'POST') {
      if (!step[0].includes(t.status)) return problem(409, 'Invariant violation', `Cannot ${sub} a ${t.status.toLowerCase()} institution.`)
      if (sub === 'activate') {
        const blockers = this.blockers(r)
        if (blockers.length) return problem(409, 'Invariant violation', 'Tenant cannot be activated.', { blockers })
      }
      t.status = step[1]
      return Response.json(this.dto(r))
    }
    return problem(404, 'Not found', `${method} ${pathname} is not part of the fake API.`)
  }

  /** Register a client the token endpoint will accept, e.g. `addClient('platform_bootstrap', 'pw', { sub: 'platform-admin', scope: ['admin'] })`. */
  addClient(clientId: string, secret: string, claims: object) {
    this.clients.set(clientId, { secret, token: jwt(claims) })
  }

  /**
   * Route `fetch` to this backend and sign in, as the app does after login. Call `reset()` in afterEach.
   * `as` an institution mints that tenant's token (scope billing:read, a tenant_id claim) instead of the admin's.
   * The clock is pinned to TEST_NOW so months and "today" are the same in every run.
   */
  async install(as?: { tenantId?: string; clientId?: string; signedIn?: boolean }) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_NOW)
    this.billing.fiTenantId = as?.tenantId ?? null
    this.token = as?.tenantId ? jwt({ sub: as.clientId ?? 'fi-client', tenant_id: as.tenantId, scope: ['billing:read', 'qr:generate', 'qr:validate'] }) : adminJwt
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('/v1/oauth/token')) {
          if (this.clients.size === 0) return Response.json({ accessToken: this.token, tokenType: 'Bearer', expiresIn: 600 })
          const form = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams()
          const client = this.clients.get(form.get('client_id') ?? '')
          if (!client || client.secret !== form.get('client_secret')) return new Response(null, { status: 401 })
          return Response.json({ accessToken: client.token, tokenType: 'Bearer', expiresIn: 600 })
        }
        const body = typeof init?.body === 'string' && init.body ? (JSON.parse(init.body) as unknown) : undefined
        return this.handle(init?.method ?? 'GET', String(url), body)
      }),
    )
    if (as?.signedIn !== false) await authenticate(as?.clientId ?? 'platform-bootstrap', 'secret')
    return this
  }

  reset() {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    this.billing.usage = []
    this.billing.adjustments = []
    this.billing.outbox = []
    this.billing.periods.clear()
    this.billing.fiTenantId = null
    this.clients.clear()
    resetApiClient()
    this.records = seed()
    this.calls = []
    this.failures.clear()
  }
}

/** A backend with the standard seven institutions, signed in. */
export const installFakeBackend = (as?: { tenantId?: string; clientId?: string; signedIn?: boolean }) => new FakeBackend().install(as)
