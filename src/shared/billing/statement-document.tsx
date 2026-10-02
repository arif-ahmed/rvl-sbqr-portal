import { QrCode } from 'lucide-react'
import { bdt, bdtRate, bdtSigned, count, periodName } from '../format'
import { cn } from '../cn'
import { disputeWindowEnd, DISPUTE_WINDOW_DAYS, type BillingPeriodMeta, type Statement } from './billing'

const th = 'bg-surface-2 border-y border-line-2 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-text-2 uppercase'
const td = 'num border-b border-line px-3 py-2.5'
const label = 'text-[11px] font-semibold tracking-wide text-text-3 uppercase'

/**
 * One statement as a printable A4 page: the bill Finance attaches to an invoice. Shown as paper
 * on screen; printed, the page margin comes from the shell and the footer repeats on every page.
 * Plain layout on purpose, so the API's server-rendered PDF can follow it. Shared by both surfaces.
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
        className="mx-auto max-w-[794px] rounded-sm border border-line bg-surface p-12 text-[13px] leading-5 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[12px] print:shadow-none"
      >
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-accent text-on-accent">
              <QrCode className="size-6" aria-hidden />
            </span>
            <div>
              <b className="block font-head text-[17px] leading-5">Secure Bangla QR</b>
              <span className="text-text-2">Relief Validation Limited</span>
            </div>
          </div>
          <div className="text-right">
            <b className="block font-head text-2xl leading-7 tracking-tight">Billing Statement</b>
            <span className="text-text-2">{periodName(statement.period)}</span>
          </div>
        </header>
        <div className="mt-5 h-[3px] rounded-full bg-accent" />

        <div className="mt-6 grid grid-cols-[1fr_1fr_auto] gap-x-8 gap-y-4">
          <div>
            <div className={label}>Billed to</div>
            <div className="mt-1 text-[15px] font-semibold">{institutionName}</div>
            {institutionCode && <div className="num text-text-2">Institution code {institutionCode}</div>}
          </div>
          <div>
            <div className={label}>Usage period</div>
            <div className="mt-1 font-semibold">
              1 – {lastDay} {periodName(statement.period)}
            </div>
            <div className="text-text-2">Rate card from {periodName(statement.rate.effectiveFrom.slice(0, 7))}</div>
          </div>
          <div className="text-right">
            <div className={label}>Status</div>
            <span
              className={cn(
                'mt-1 inline-block rounded-full border px-3 py-0.5 text-[11px] font-bold tracking-wider uppercase',
                finalized ? 'border-ok/40 bg-ok-bg text-ok' : 'border-warn/40 bg-warn-bg text-warn',
              )}
            >
              {finalized ? 'Finalized' : 'Draft'}
            </span>
          </div>
        </div>
        <p className="mt-3 text-text-2">
          {finalized
            ? `Approved on ${meta.finalizedAt} by ${meta.finalizedBy}. This statement is locked.`
            : `Not yet approved${meta.calculatedAt ? `, calculated ${meta.calculatedAt}` : ''}. Figures may change until the month is finalized.`}
        </p>

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
            {lines.map(([name, quantity, rate, amount]) => (
              <tr key={name}>
                <td className="border-b border-line px-3 py-2.5">{name}</td>
                <td className={cn(td, 'text-right')}>{count(quantity)}</td>
                <td className={cn(td, 'text-right')}>{bdtRate(rate)}</td>
                <td className={cn(td, 'text-right')}>{bdt(amount)}</td>
              </tr>
            ))}
            {statement.adjustments.map((a) => (
              <tr key={a.id}>
                <td className="border-b border-line px-3 py-2.5">
                  Adjustment
                  <small className="block text-text-3">
                    {a.createdAt.slice(0, 10)} · {a.reason}
                  </small>
                </td>
                <td className={cn(td, 'text-right')}>1</td>
                <td className={cn(td, 'text-right')}>—</td>
                <td className={cn(td, 'text-right')}>{bdtSigned(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-72 break-inside-avoid">
          <div className="flex justify-between px-3 py-1 text-text-2">
            <span>Subtotal</span>
            <span className="num">{bdt(statement.subtotal)}</span>
          </div>
          <div className="flex justify-between px-3 py-1 text-text-2">
            <span>Adjustments</span>
            <span className="num">{statement.adjustmentsTotal ? bdtSigned(statement.adjustmentsTotal) : bdt(0)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between rounded-lg bg-accent-soft px-3 py-2.5">
            <b className="text-[13px]">Total (BDT)</b>
            <b className="num font-head text-xl">{bdt(statement.total)}</b>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-text-3">
          Every completed check is charged, including rejections. Requests too old to check are not charged.
        </p>

        {earlier.length > 0 && (
          <section className="mt-7 break-inside-avoid">
            <h3 className={cn(label, 'mb-2')}>Earlier approved statements</h3>
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
                    <td className={cn(td, 'py-2 text-right')}>{bdt(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-7 break-inside-avoid border-l-[3px] border-line-2 pl-4">
          <div className={label}>Disputes</div>
          <p className="mt-1 text-text-2">
            {finalized && meta.finalizedAt
              ? `Questions about this statement are accepted until ${disputeWindowEnd(meta.finalizedAt)} (${DISPUTE_WINDOW_DAYS} days after approval).`
              : `The ${DISPUTE_WINDOW_DAYS}-day dispute window starts when this month is finalized.`}
          </p>
        </section>

        <p className="mt-8 border-t border-line pt-3 text-[11.5px] text-text-3">
          This statement is a billing record, not a tax invoice. Finance issues invoices from approved statements.
        </p>
      </article>

      {/* Printed, this repeats at the foot of every page so the status is never missing. */}
      <div className="fixed inset-x-0 bottom-0 hidden items-center justify-between border-t border-line bg-surface px-[16mm] py-[7mm] text-[10.5px] text-text-3 print:flex">
        <span>
          {finalized ? 'Finalized' : 'Draft'} · {institutionName} · {periodName(statement.period)}
        </span>
        <span>Secure Bangla QR · Not a tax invoice</span>
      </div>
    </>
  )
}
