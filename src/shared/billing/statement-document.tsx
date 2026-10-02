import { bdt, bdtRate, bdtSigned, count, periodName } from '../format'
import { cn } from '../cn'
import { disputeWindowEnd, DISPUTE_WINDOW_DAYS, type BillingPeriodMeta, type Statement } from './billing'

const th = 'border-b border-line-2 px-3 py-2 text-left text-xs font-semibold text-text-2'
const td = 'num border-b border-line px-3 py-2'

/**
 * One statement as a printable A4 page: the bill Finance attaches to an invoice. Plain layout on
 * purpose, so the browser's "Save as PDF" and the API's server-rendered PDF can share it.
 * Shared by the staff and FI surfaces.
 */
export function StatementDocument({
  statement,
  institutionName,
  institutionCode,
  meta,
  earlier,
}: {
  statement: Statement
  institutionName: string
  institutionCode?: string
  meta: BillingPeriodMeta
  earlier: { period: string; total: number }[]
}) {
  const finalized = meta.status === 'Finalized'
  const [year, month] = statement.period.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const lines = [
    ['Static QR generation', statement.counts.staticGenerations, statement.rate.generationRate, statement.staticGenerationAmount],
    ['Dynamic QR generation', statement.counts.dynamicGenerations, statement.rate.generationRate, statement.dynamicGenerationAmount],
    ['QR validation (conclusive results)', statement.counts.validations, statement.rate.validationRate, statement.validationAmount],
  ] as const

  return (
    <>
      <article
        aria-label="Statement"
        className="mx-auto max-w-[794px] rounded-xl border border-line bg-surface p-10 text-[13px] print:max-w-none print:rounded-none print:border-0 print:p-0"
      >
        <header className="flex items-start justify-between gap-6 border-b-2 border-text pb-5">
          <div>
            <b className="block font-head text-lg">Secure Bangla QR</b>
            <span className="text-text-2">Relief Validation Limited</span>
          </div>
          <div className="text-right">
            <b className="block font-head text-lg">Billing statement</b>
            <span className="text-text-2">{periodName(statement.period)}</span>
          </div>
        </header>

        <div
          className={cn('mt-5 rounded-lg border px-4 py-3', finalized ? 'border-ok/40 bg-ok-bg' : 'border-warn/40 bg-warn-bg')}
        >
          <b className={cn('block text-sm tracking-wide uppercase', finalized ? 'text-ok' : 'text-warn')}>{finalized ? 'Finalized' : 'Draft'}</b>
          <span className="text-text-2">
            {finalized
              ? `Approved on ${meta.finalizedAt} by ${meta.finalizedBy}. This statement is locked.`
              : `Not yet approved${meta.calculatedAt ? `, calculated ${meta.calculatedAt}` : ''}. Figures may change until the month is finalized.`}
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <dt className="text-xs text-text-3">Billed to</dt>
            <dd className="font-semibold">{institutionName}</dd>
            {institutionCode && <dd className="num text-text-2">Institution code {institutionCode}</dd>}
          </div>
          <div>
            <dt className="text-xs text-text-3">Usage period</dt>
            <dd className="font-semibold">
              1 – {lastDay} {periodName(statement.period)}
            </dd>
            <dd className="text-text-2">Rate card effective {periodName(statement.rate.effectiveFrom.slice(0, 7))}</dd>
          </div>
        </dl>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Operation</th>
              <th className={cn(th, 'text-right')}>Quantity</th>
              <th className={cn(th, 'text-right')}>Price per call</th>
              <th className={cn(th, 'text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, quantity, rate, amount]) => (
              <tr key={label}>
                <td className="border-b border-line px-3 py-2">{label}</td>
                <td className={cn(td, 'text-right')}>{count(quantity)}</td>
                <td className={cn(td, 'text-right')}>{bdtRate(rate)}</td>
                <td className={cn(td, 'text-right')}>{bdt(amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right text-text-2">Subtotal</td>
              <td className="num px-3 py-2 text-right">{bdt(statement.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right text-text-2">Adjustments</td>
              <td className="num px-3 py-2 text-right">{statement.adjustmentsTotal ? bdtSigned(statement.adjustmentsTotal) : bdt(0)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="border-t-2 border-text px-3 py-2.5 text-right text-base font-bold">Total (BDT)</td>
              <td className="num border-t-2 border-text px-3 py-2.5 text-right text-base font-bold">{bdt(statement.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-text-3">Only completed checks are charged, including rejections. Requests that were too old to check are not charged.</p>

        {statement.adjustments.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h3 className="mb-1.5 text-sm font-semibold">Adjustments</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Recorded by</th>
                  <th className={cn(th, 'text-right')}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.adjustments.map((a) => (
                  <tr key={a.id}>
                    <td className={cn(td, 'whitespace-nowrap')}>{a.createdAt.slice(0, 10)}</td>
                    <td className="border-b border-line px-3 py-2">{a.reason}</td>
                    <td className="border-b border-line px-3 py-2">{a.createdBy}</td>
                    <td className={cn(td, 'text-right')}>{bdtSigned(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {earlier.length > 0 && (
          <section className="mt-6 break-inside-avoid">
            <h3 className="mb-1.5 text-sm font-semibold">Earlier approved statements</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Month</th>
                  <th className={cn(th, 'text-right')}>Total</th>
                </tr>
              </thead>
              <tbody>
                {earlier.map((e) => (
                  <tr key={e.period}>
                    <td className="border-b border-line px-3 py-2">{periodName(e.period)}</td>
                    <td className={cn(td, 'text-right')}>{bdt(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-6 break-inside-avoid rounded-lg border border-line px-4 py-3">
          <b className="block">Disputes</b>
          <span className="text-text-2">
            {finalized && meta.finalizedAt
              ? `Questions about this statement are accepted until ${disputeWindowEnd(meta.finalizedAt)} (${DISPUTE_WINDOW_DAYS} days after approval).`
              : `The ${DISPUTE_WINDOW_DAYS}-day dispute window starts when this month is finalized.`}
          </span>
        </section>

        <p className="mt-8 border-t border-line pt-3 text-xs text-text-3">
          This statement is a billing record, not a tax invoice. Finance issues invoices from approved statements.
        </p>
      </article>

      {/* Printed, this repeats at the foot of every page so the status is never missing. */}
      <div className="fixed inset-x-0 bottom-0 hidden border-t border-line bg-surface py-2 text-center text-xs text-text-2 print:block">
        {finalized ? 'Finalized' : 'Draft'} · {institutionName} · {periodName(statement.period)} · Not a tax invoice
      </div>
    </>
  )
}
