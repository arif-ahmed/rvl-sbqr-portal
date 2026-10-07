import { zodResolver } from '@hookform/resolvers/zod'
import { QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { changePasswordRequest } from '../shared/api/client'
import { homePath, PASSWORD_CHANGED_NOTICE, signOut, useSession } from '../shared/auth/session'
import { Banner, Button, Card, Field, Input } from '../shared/ui'

// The API only requires the new password to differ from the current one (max 256 characters).
// Eight characters is a UI floor, not an API rule.
const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(8, 'Use at least 8 characters.').max(256, 'Use at most 256 characters.'),
    confirm: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a password different from the current one.' })
type Values = z.infer<typeof schema>

/** Change the signed-in user's password. The API ends every session on success, so it ends in a fresh sign-in. */
export default function ChangePasswordPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (session) document.documentElement.dataset.surface = session.surface
  }, [session])

  if (!session) return <Navigate to="/login" replace />

  async function onSubmit(v: Values) {
    setError('')
    try {
      await changePasswordRequest(v.currentPassword, v.newPassword)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the password.')
      return
    }
    void signOut(PASSWORD_CHANGED_NOTICE)
    navigate('/login', { replace: true })
  }

  return (
    <div className="grid min-h-svh place-items-center bg-surface-2 p-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-accent text-on-accent">
            <QrCode className="size-5" aria-hidden />
          </span>
          <b className="font-head text-sm">Secure Bangla QR</b>
        </div>
        <Card className="p-6">
          <h1 className="mb-1.5 font-head text-[22px] leading-7 font-bold tracking-tight">Change password</h1>
          <p className="mb-5 text-text-2">
            {session.mustChangePassword ? 'Choose a new password before you continue.' : 'You will be signed out everywhere and asked to sign in again.'}
          </p>

          {session.mustChangePassword && <Banner tone="warn" title="Your account needs a new password." />}
          {error && <Banner tone="bad" title={error} />}

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
              <Input id="currentPassword" type="password" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...form.register('currentPassword')} />
            </Field>
            <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
              <Input id="newPassword" type="password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...form.register('newPassword')} />
            </Field>
            <Field label="Repeat new password" htmlFor="confirm" error={errors.confirm?.message}>
              <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register('confirm')} />
            </Field>
            <div className="mt-2 flex gap-3">
              <Button type="submit" variant="primary" className="h-11 flex-1" disabled={isSubmitting}>
                Change password
              </Button>
              {!session.mustChangePassword ? (
                <Button className="h-11" onClick={() => navigate(homePath(session))}>
                  Cancel
                </Button>
              ) : (
                <Button
                  className="h-11"
                  onClick={() => {
                    void signOut()
                    navigate('/login', { replace: true })
                  }}
                >
                  Sign out
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
