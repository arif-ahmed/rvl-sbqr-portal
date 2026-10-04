import { vi } from 'vitest'
import { authenticate, resetApiClient } from '../shared/api/client'
import type { OnboardingDto, OnboardingStepDto, StepCode, StepStatus, TenantDto } from '../surfaces/staff/institutions/api/types'
import { stepOrder } from '../surfaces/staff/institutions/api/types'

// An in-memory stand-in for the tenant onboarding API, following the contract in
// docs/features/institution-onboarding/implementation-guide.md (section 2). It lets the staff
// screens run end to end in jsdom: every request goes through the real api client and
// TanStack Query. It is deliberately small — the rules it mirrors are the reconcile table,
// the activation blockers and the 409 for a repeated credential issue.

type Tenant = Omit<TenantDto, 'hasRateCard' | 'onboarding'>

type Rec = {
  tenant: Tenant
  configSaved: boolean
  credential: { clientId: string } | null
  certificate: { thumbprintSha256: string; subject: string; expiresAt: string } | null
  certSkipped: boolean
  signingKey: boolean
  hasRateCard: boolean
  /** Whether the institution is in the trust directory. Activation needs it. */
  trust: boolean
}

export type Call = { method: string; path: string; body: unknown }

const adminJwt = `h.${btoa(JSON.stringify({ sub: 'platform-admin', scope: ['admin'] }))}.s`
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

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

const cert = (subject: string, days: number) => ({ thumbprintSha256: 'A1'.repeat(32), subject, expiresAt: inDays(days) })
const blank = { configSaved: false, credential: null, certificate: null, certSkipped: false, signingKey: false, hasRateCard: false, trust: true }

/** The institutions the list and detail tests expect (same ids and names as the old mock data). */
function seed(): Rec[] {
  return [
    { ...blank, tenant: tenant('inst-1', 'Shapla Commercial Bank', '000901', 'ACTIVE', 'Rafiq Ahmed', 'rafiq.ahmed@shaplabank.example'), configSaved: true, credential: { clientId: '000901-7c1d9e02' }, certificate: cert('CN=gateway.shaplabank.example', 300), signingKey: true, hasRateCard: true },
    { ...blank, tenant: tenant('inst-2', 'Karnaphuli Trust Bank', '000902', 'ACTIVE', 'Sabina Yasmin', 'sabina@karnaphulitrust.example'), configSaved: true, credential: { clientId: '000902-b40e5a11' }, certificate: cert('CN=gateway.karnaphulitrust.example', 12), signingKey: true, hasRateCard: true },
    { ...blank, tenant: tenant('inst-3', 'Teesta Digital Wallet', '022901', 'ACTIVE', 'Nusrat Jahan', 'nusrat@teestawallet.example', { gen: false, val: true }), configSaved: true, credential: { clientId: '022901-e93b6f48' }, certificate: cert('CN=gateway.teestawallet.example', 210), signingKey: true },
    { ...blank, tenant: tenant('inst-4', 'Surma Payments Ltd', '032901', 'PENDING', 'Jahid Hasan', 'jahid.hasan@surmapayments.example'), configSaved: true, credential: { clientId: '032901-3f9a1c20' } },
    { ...blank, tenant: tenant('inst-5', 'Nilgiri Mercantile Bank', '000903', 'PENDING', 'Kamal Uddin', 'kamal.uddin@nilgirimercantile.example') },
    { ...blank, tenant: tenant('inst-6', 'Chandra Settlement Services', '042901', 'SUSPENDED', 'Mizanur Rahman', 'mizan@chandrasettlement.example'), configSaved: true, credential: { clientId: '042901-52d7c0aa' }, certificate: cert('CN=gateway.chandrasettlement.example', 150), signingKey: true },
    { ...blank, tenant: tenant('inst-7', 'Doyel Co-operative Finance', '012901', 'TERMINATED', 'Farzana Akter', 'farzana@doyelfinance.example'), configSaved: true, credential: { clientId: '012901-9a08be37' }, certificate: cert('CN=gateway.doyelfinance.example', -40), signingKey: true },
  ]
}

const problem = (status: number, title: string, detail: string, extra: object = {}) => Response.json({ title, detail, status, ...extra }, { status })

export class FakeBackend {
  records: Rec[] = seed()
  calls: Call[] = []
  private counter = 0
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
    this.records.unshift({ ...blank, tenant: tenant(`added-${code}`, name, code, status, 'Ops Desk', 'ops@example.test') })
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
      case 'CERTIFICATE':
        return r.certificate ? 'COMPLETED' : r.certSkipped ? 'SKIPPED' : 'NOT_STARTED'
      case 'SIGNING_KEY':
        return r.signingKey ? 'COMPLETED' : 'NOT_STARTED'
      case 'REVIEW':
        return active ? 'COMPLETED' : 'NOT_STARTED'
    }
  }

  private steps(r: Rec): OnboardingStepDto[] {
    return stepOrder.map((code) => {
      const status = this.statusOf(code, r)
      return { code, status, required: code !== 'CERTIFICATE', completedAt: status === 'COMPLETED' ? inDays(0) : null, completedBy: status === 'COMPLETED' ? 'platform:admin' : null }
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
    const done = (s: OnboardingStepDto) => s.status === 'COMPLETED' || s.status === 'SKIPPED'
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
      certificate: r.certificate,
      signingKey: r.signingKey ? { keyId: `${r.tenant.institutionCode}-key`, version: 1, status: 'ACTIVE' } : null,
    }
  }

  private dto(r: Rec): TenantDto {
    const o = this.onboarding(r)
    const pending = r.tenant.status === 'PENDING'
    return {
      ...r.tenant,
      hasRateCard: r.hasRateCard,
      onboarding: pending ? { completedSteps: o.steps.filter((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length, totalSteps: o.steps.length, currentStep: o.currentStep } : null,
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

    if (pathname === '/v1/admin/institutions') return new Response(null, { status: 404 }) // the picker falls back to its built-in list
    if (pathname === '/v1/admin/tenants' && method === 'GET') {
      const items = this.records.map((r) => this.dto(r))
      return Response.json({ items, page: 1, pageSize: 100, totalCount: items.length, hasMore: false })
    }
    if (pathname === '/v1/admin/tenants' && method === 'POST') {
      if (this.records.some((r) => r.tenant.institutionCode === b.institutionCode)) return problem(409, 'Duplicate institution', 'An institution with this code is already registered.')
      const code = String(b.institutionCode)
      const t = tenant(`new-${++this.counter}`, String(b.institutionName), code, 'PENDING', String(b.contactName), String(b.contactEmail))
      t.contactPhone = (b.contactPhone as string) ?? null
      t.address = (b.address as string) ?? null
      this.records.unshift({ ...blank, tenant: t })
      return Response.json(this.dto(this.records[0]), { status: 201 })
    }
    if (pathname === '/v1/crypto-keys' && method === 'POST') {
      const r = this.find(String(b.tenantId))
      if (!r) return problem(404, 'Tenant not found', 'No such tenant.')
      r.signingKey = true
      return Response.json({ tenantId: r.tenant.tenantId, status: 'ACTIVE' }, { status: 201 })
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
    if (sub === 'client-certificate' && method === 'POST') {
      if (!r.credential) return problem(409, 'Invariant violation', 'No active API client to bind a certificate to.')
      r.certificate = { thumbprintSha256: String(b.thumbprintSha256), subject: String(b.subject), expiresAt: String(b.expiresAt) }
      return Response.json(r.certificate)
    }
    if (sub === 'onboarding/steps/CERTIFICATE' && method === 'PUT') {
      if (b.status !== 'SKIPPED') return problem(400, 'Invalid step', 'Only SKIPPED is accepted.')
      r.certSkipped = true
      return new Response(null, { status: 204 })
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

  /** Route `fetch` to this backend and sign in, as the app does after login. Call `reset()` in afterEach. */
  async install() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('/v1/oauth/token')) return Response.json({ accessToken: adminJwt, tokenType: 'Bearer', expiresIn: 600 })
        const body = typeof init?.body === 'string' && init.body ? (JSON.parse(init.body) as unknown) : undefined
        return this.handle(init?.method ?? 'GET', String(url), body)
      }),
    )
    await authenticate('platform-bootstrap', 'secret')
    return this
  }

  reset() {
    vi.unstubAllGlobals()
    resetApiClient()
  }
}

/** A backend with the standard seven institutions, signed in. */
export const installFakeBackend = () => new FakeBackend().install()
