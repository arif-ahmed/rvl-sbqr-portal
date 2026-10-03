/** Demo stand-ins for the credentials the API will issue. Never real. */

export function demoSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The client ID derives from the institution code so it stays recognizable in logs and statements. */
export function demoCredentials(code: string): { clientId: string; secret: string } {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')
  return { clientId: `${code}-${suffix}`, secret: demoSecret() }
}
