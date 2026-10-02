import { z } from 'zod'

export const certSchema = z.object({
  thumbprint: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, 'Enter the 64-character SHA-256 thumbprint.'),
  subject: z.string().trim().min(1, 'Enter the certificate subject.'),
  expiresAt: z.string().refine((d) => d !== '' && new Date(d) > new Date(), 'Enter an expiry date in the future.'),
})
