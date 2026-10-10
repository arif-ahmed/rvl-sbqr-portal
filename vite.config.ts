import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// The SPA only ever issues same-origin requests (/v1/..., /openapi/...):
//   - dev/preview: the Vite proxy below forwards them to SBQR_API_URL, read from
//           .env (see .env.example) or the shell, defaulting to the local SBQR.Api
//           (rvl-secure-bqr-manager, `dotnet run` → http://localhost:5001);
//   - prod: the vercel.json rewrites forward them to the deployed API host.
// The API has no CORS policy — this is the same approach the FI app emulator
// (rvl-sbqr-app-emulator) uses against its BFF.
export default defineConfig(({ mode }) => {
  // Vite does not put .env files into process.env for the config file; load them
  // explicitly (empty prefix = all keys, not just VITE_*). Shell variables win.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const target = env.SBQR_API_URL || 'http://localhost:5001'
  const port = Number(env.PORT || 5175)
  const proxy = {
    '/v1': { target, changeOrigin: true },
    '/openapi': { target, changeOrigin: true },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { port, proxy },
    preview: { port, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    },
  }
})
