import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button, Drawer, Field, Input } from '../../../shared/ui'
import { certSchema } from './schemas'
import type { Certificate } from './types'

/** Replace an institution's mTLS client certificate. The new one takes effect immediately. */
export function CertificateDrawer(props: { open: boolean; name: string; onClose: () => void; onSave: (c: Certificate) => void }) {
  const { open, name, onClose, onSave } = props
  const form = useForm<Certificate>({ resolver: zodResolver(certSchema), defaultValues: { thumbprint: '', subject: '', expiresAt: '' } })
  const { errors } = form.formState

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          form.reset()
          onClose()
        }
      }}
      title="Replace certificate"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={form.handleSubmit(onSave)}>
            Replace certificate
          </Button>
        </>
      }
    >
      <p className="mb-4 text-text-2">{name}. The current certificate stops working as soon as the new one is registered.</p>
      <Field label="SHA-256 thumbprint" htmlFor="new-thumbprint" error={errors.thumbprint?.message}>
        <Input id="new-thumbprint" autoComplete="off" spellCheck={false} className="num" aria-invalid={!!errors.thumbprint} {...form.register('thumbprint')} />
      </Field>
      <Field label="Subject" htmlFor="new-subject" error={errors.subject?.message}>
        <Input id="new-subject" autoComplete="off" placeholder="CN=gateway.example" aria-invalid={!!errors.subject} {...form.register('subject')} />
      </Field>
      <Field label="Expires on" htmlFor="new-expires" error={errors.expiresAt?.message}>
        <Input id="new-expires" type="date" aria-invalid={!!errors.expiresAt} {...form.register('expiresAt')} />
      </Field>
    </Drawer>
  )
}
