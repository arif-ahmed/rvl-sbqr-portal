// First API seam for the staff portal: same-origin calls (dev: Vite proxy,
// prod: vercel.json rewrites — see vite.config.ts) authenticated with the
// platform bootstrap client. Per-user sign-in does not exist in the API yet,
// so staff surfaces share this admin token until it does (see session.ts).

const clientId = 'platform-bootstrap'

type TokenCache = { token: string; expEpochMs: number }
let cached: TokenCache | null = null

function bootstrapSecret(): string | null {
  return import.meta.env.VITE_BOOTSTRAP_CLIENT_SECRET ?? null
}

async function mintToken(): Promise<string> {
  const secret = bootstrapSecret()
  if (!secret) throw new Error('VITE_BOOTSTRAP_CLIENT_SECRET is not set')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: secret,
  })
  const res = await fetch('/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`token mint failed: ${res.status}`)
  const json = (await res.json()) as { accessToken: string; expiresIn: number }
  // Refresh 30s early — the API issues 600s tokens.
  cached = { token: json.accessToken, expEpochMs: Date.now() + (json.expiresIn - 30) * 1000 }
  return json.accessToken
}

async function bearer(): Promise<string> {
  if (cached && Date.now() < cached.expEpochMs) return cached.token
  return mintToken()
}

/** Authed GET. Re-mints once and retries on 401 (rotated/expired token). */
export async function apiGet<T>(path: string): Promise<T> {
  const attempt = (token: string) =>
    fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  let res = await attempt(await bearer())
  if (res.status === 401) {
    cached = null
    res = await attempt(await bearer())
  }
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/** For tests: drop the in-memory token. */
export function resetApiClient() {
  cached = null
}
