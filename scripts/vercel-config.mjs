// Routing for the Vercel deployment, as a Build Output API v3 config.
//
// vercel.json rewrites are static text and cannot read environment variables, so the API host
// would be hardcoded per environment. Instead `npm run build` runs scripts/vercel-output.mjs on
// Vercel, which writes this config with the host taken from SBQR_API_URL (set per environment in
// the Vercel dashboard). The browser still only talks to its own origin: /v1 and /openapi are
// proxied to the API, so there is no CORS and the HttpOnly refresh cookie stays first-party.

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

/** The API origin from SBQR_API_URL, without a trailing slash. Throws a build-failing message if unusable. */
export function parseApiOrigin(value) {
  if (!value) throw new Error('SBQR_API_URL is not set. Set it for this Vercel environment, e.g. https://rvl-sbqr-api-dev.fly.dev')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`SBQR_API_URL is not a valid URL: ${value}`)
  }
  if (url.protocol !== 'https:') throw new Error(`SBQR_API_URL must use https: ${value}`)
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error(`SBQR_API_URL must be an origin only (no path, query or fragment): ${value}`)
  }
  return url.origin
}

export function buildOutputConfig(apiOrigin) {
  return {
    version: 3,
    routes: [
      { src: '/assets/(.*)', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '/(.*)', headers: SECURITY_HEADERS, continue: true },
      { src: '/v1/(.*)', dest: `${apiOrigin}/v1/$1` },
      { src: '/openapi/(.*)', dest: `${apiOrigin}/openapi/$1` },
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  }
}
