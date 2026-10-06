import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { homePath, signIn, useSession, type Surface } from '../shared/auth/session'
import { cn } from '../shared/cn'
import { Banner, Button, Field, Input } from '../shared/ui'

// The API has no per-user accounts yet, so sign-in is a client-credentials
// exchange (POST /v1/oauth/token): the "username" is the client_id and the
// "password" the client_secret issued at provisioning (AGENTS.md).
const schema = z.object({
  clientId: z.string().trim().min(1, 'Enter your client ID.'),
  clientSecret: z.string().min(1, 'Enter your client secret.'),
})
type Values = z.infer<typeof schema>

const copy: Record<Surface, { headline: string; text: string; hint: string }> = {
  fi: {
    headline: 'Your QR usage, statements and credentials in one place.',
    text: 'Review every generation and validation, download monthly statements, and rotate your client secret when it expires.',
    hint: 'your-client-id',
  },
  staff: {
    headline: 'Run QR operations and billing with confidence.',
    text: 'Onboard institutions, manage keys, set rate cards and close each billing month with a full audit trail.',
    hint: 'platform-bootstrap',
  },
}

export default function LoginPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [surface, setSurface] = useState<Surface>('fi')
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { clientId: '', clientSecret: '' } })
  const { errors, isSubmitting } = form.formState

  // The login screen takes its look from the chosen audience, like the signed-in app does.
  useEffect(() => {
    document.documentElement.dataset.surface = surface
  }, [surface])

  if (session) return <Navigate to={homePath(session)} replace />

  async function onSubmit(v: Values) {
    setError('')
    try {
      const next = await signIn(v.clientId, v.clientSecret, surface)
      navigate(homePath(next), { replace: true })
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
          <h2 className="mb-3.5 max-w-[16ch] font-head text-[32px] leading-[40px] font-bold tracking-tight">{copy[surface].headline}</h2>
          <p className="max-w-[44ch] text-[15px] leading-[23px] text-side-text">{copy[surface].text}</p>
        </div>
        <small className="text-side-head">© 2026 Relief Validation Limited · Bangladesh Bank BQR</small>
      </section>

      <section className="grid place-items-center p-8">
        <div className="w-full max-w-[420px]">
          <h1 className="mb-1.5 font-head text-[26px] leading-8 font-bold tracking-tight">Sign in</h1>
          <p className="mb-6 text-text-2">{surface === 'fi' ? 'Institution portal for Secure Bangla QR.' : 'RVL staff console for operations and billing.'}</p>

          <div role="tablist" aria-label="Sign in as" className="mb-6 grid grid-cols-2 rounded-[11px] bg-line p-1">
            {(['fi', 'staff'] as const).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={surface === s}
                onClick={() => {
                  setSurface(s)
                  setError('')
                }}
                className={cn('h-9 rounded-lg font-semibold text-text-2', surface === s && 'bg-surface text-text shadow-sm')}
              >
                {s === 'fi' ? 'Institution' : 'RVL Staff'}
              </button>
            ))}
          </div>

          {error && <Banner tone="bad" title={error} />}

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <Field label="Client ID" htmlFor="clientId" error={errors.clientId?.message}>
              <Input id="clientId" autoComplete="off" placeholder={copy[surface].hint} aria-invalid={!!errors.clientId} {...form.register('clientId')} />
            </Field>
            <Field label="Client secret" htmlFor="clientSecret" error={errors.clientSecret?.message} hint="Issued when the account was provisioned and shown only once.">
              <div className="relative">
                <Input id="clientSecret" type={showPw ? 'text' : 'password'} autoComplete="off" spellCheck={false} aria-invalid={!!errors.clientSecret} {...form.register('clientSecret')} />
                <button
                  type="button"
                  className="absolute top-1 right-1.5 grid size-8 place-items-center text-text-3"
                  aria-label={showPw ? 'Hide client secret' : 'Show client secret'}
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
