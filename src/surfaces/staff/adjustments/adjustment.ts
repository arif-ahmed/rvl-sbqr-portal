import { z } from 'zod'

/** The form holds the amount as text, like the rate-card prices; it settles as a statement line. */
const amount = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Enter an amount in BDT, e.g. -500 or 250.')
  .refine((v) => Number(v) !== 0, 'The amount must be non-zero.')

export const adjustmentSchema = z.object({
  institutionId: z.string().min(1, 'Choose an institution.'),
  period: z.string().min(1, 'Choose a period.'),
  amount,
  reason: z.string().trim().min(8, 'Give a reason of at least 8 characters.'),
})

export type AdjustmentForm = z.infer<typeof adjustmentSchema>
