import { describe, expect, it } from 'vitest'
import { buildOutputConfig, parseApiOrigin } from './vercel-config.mjs'

describe('parseApiOrigin', () => {
  it('accepts an https origin and drops a trailing slash', () => {
    expect(parseApiOrigin('https://rvl-sbqr-api-dev.fly.dev')).toBe('https://rvl-sbqr-api-dev.fly.dev')
    expect(parseApiOrigin('https://rvl-sbqr-api-dev.fly.dev/')).toBe('https://rvl-sbqr-api-dev.fly.dev')
  })

  it.each([undefined, '', 'not a url', 'http://api.example.com', 'https://api.example.com/v1', 'https://api.example.com/?x=1'])(
    'rejects %j',
    (value) => {
      expect(() => parseApiOrigin(value)).toThrow(/SBQR_API_URL/)
    },
  )
})

describe('buildOutputConfig', () => {
  const { routes } = buildOutputConfig('https://rvl-sbqr-api-dev.fly.dev')

  it('proxies /v1 and /openapi to the API before the SPA fallback', () => {
    const dests = routes.filter((r) => r.dest).map((r) => r.dest)
    expect(dests).toEqual(['https://rvl-sbqr-api-dev.fly.dev/v1/$1', 'https://rvl-sbqr-api-dev.fly.dev/openapi/$1', '/index.html'])
  })

  it('serves files before falling back to index.html', () => {
    const i = routes.findIndex((r) => r.handle === 'filesystem')
    expect(routes[i + 1].dest).toBe('/index.html')
  })

  it('keeps connect-src locked to self', () => {
    const csp = routes.find((r) => r.headers?.['Content-Security-Policy']).headers['Content-Security-Policy']
    expect(csp).toContain("connect-src 'self'")
  })
})
