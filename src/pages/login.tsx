import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { clearSessionNotice, landingPath, signIn, useSession, useSessionNotice } from '../shared/auth/session'
import { Banner, Button, Field, Input } from '../shared/ui'

// Users sign in with the username and password of their account (POST /v1/auth/login).
// Accounts are created by the platform; there is no self-service registration.
const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

/** Only follow in-app paths back after sign-in (never an absolute or protocol-relative URL). */
function safeReturnPath(from: unknown): string | null {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login') ? from : null
}

export default function LoginPage() {
  const session = useSession()
  const notice = useSessionNotice()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = safeReturnPath((location.state as { from?: unknown } | null)?.from)
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    document.documentElement.dataset.surface = 'staff'
  }, [])

  if (session) return <Navigate to={session.mustChangePassword ? landingPath(session) : (returnTo ?? landingPath(session))} replace />

  async function onSubmit(v: Values) {
    setError('')
    try {
      const next = await signIn(v.username, v.password)
      clearSessionNotice()
      navigate(next.mustChangePassword ? landingPath(next) : (returnTo ?? landingPath(next)), { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.')
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-side to-side-2 p-11 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-white text-accent-strong">
            <QrCode className="size-5" aria-hidden />
          </span>
          <b className="font-head text-sm">Secure Bangla QR</b>
        </div>
        <div>
          <h2 className="mb-3.5 max-w-[16ch] font-head text-[32px] leading-[40px] font-bold tracking-tight">Run QR operations and billing with confidence.</h2>
          <p className="max-w-[44ch] text-[15px] leading-[23px] text-side-text">
            Onboard institutions, manage keys, set rate cards and close each billing month with a full audit trail.
          </p>
        </div>
        <small className="text-side-head">© 2026 Relief Validation Limited · Bangladesh Bank BQR</small>
      </section>

      <section className="grid place-items-center p-8">
        <div className="w-full max-w-[420px]">
          <h1 className="mb-1.5 font-head text-[26px] leading-8 font-bold tracking-tight">Sign in</h1>
          <p className="mb-6 text-text-2">RVL staff console for operations and billing.</p>

          {notice && !error && <Banner tone="info" title={notice} />}
          {error && <Banner tone="bad" title={error} />}

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <Field label="Username" htmlFor="username" error={errors.username?.message}>
              <Input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!errors.username} {...form.register('username')} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <div className="relative">
                <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" spellCheck={false} aria-invalid={!!errors.password} {...form.register('password')} />
                <button
                  type="button"
                  className="absolute top-1 right-1.5 grid size-8 place-items-center text-text-3"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </Field>
            <Button type="submit" variant="primary" className="mt-2 h-11 w-full" disabled={isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}
