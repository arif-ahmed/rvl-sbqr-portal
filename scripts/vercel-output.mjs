// Runs at the end of `npm run build`. On Vercel (VERCEL=1) it packages dist/ as a Build Output API
// bundle in .vercel/output with the API proxy routes pointed at SBQR_API_URL. Elsewhere it does
// nothing, so local builds are unchanged; pass --force to produce the bundle locally for inspection.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { buildOutputConfig, parseApiOrigin } from './vercel-config.mjs'

if (!process.env.VERCEL && !process.argv.includes('--force')) process.exit(0)

let origin
try {
  origin = parseApiOrigin(process.env.SBQR_API_URL)
} catch (e) {
  console.error(`vercel-output: ${e.message}`)
  process.exit(1)
}

rmSync('.vercel/output', { recursive: true, force: true })
mkdirSync('.vercel/output', { recursive: true })
cpSync('dist', '.vercel/output/static', { recursive: true })
writeFileSync('.vercel/output/config.json', `${JSON.stringify(buildOutputConfig(origin), null, 2)}\n`)
console.log(`vercel-output: /v1 and /openapi -> ${origin}`)
