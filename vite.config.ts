import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The SPA only ever issues same-origin requests (/v1/..., /openapi/...):
//   - dev:  the Vite server proxy below forwards them to the local SBQR.Api
//           (rvl-secure-bqr-manager, `dotnet run` → http://localhost:5001);
//   - prod: the vercel.json rewrites forward them to the deployed API host.
// The API has no CORS policy — this is the same approach the FI app emulator
// (rvl-sbqr-app-emulator) uses against its BFF.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT || 5175),
    proxy: {
      '/v1': {
        target: process.env.SBQR_API_URL || 'http://localhost:5001',
        changeOrigin: true,
      },
      '/openapi': {
        target: process.env.SBQR_API_URL || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: Number(process.env.PORT || 5175),
    proxy: {
      '/v1': {
        target: process.env.SBQR_API_URL || 'http://localhost:5001',
        changeOrigin: true,
      },
      '/openapi': {
        target: process.env.SBQR_API_URL || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
