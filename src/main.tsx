import '@fontsource-variable/inter'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { restoreSession } from './shared/auth/session'
import './index.css'

// A reload keeps you signed in: the HttpOnly refresh cookie is traded for a fresh session before routing.
void restoreSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
