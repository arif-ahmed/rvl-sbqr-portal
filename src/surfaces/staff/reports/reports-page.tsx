import { Link } from 'react-router-dom'
import { cn } from '../../../shared/cn'
import { stampNow } from '../../../shared/billing/billing'
import { InstitutionView } from './institution-view'
import { SummaryView } from './summary-view'
import { TrendView } from './trend-view'

export type ReportView = 'summary' | 'institution' | 'trend'

const tabs: { view: ReportView; label: string; to: string }[] = [
  { view: 'summary', label: 'Monthly summary', to: '/staff/reports' },
  { view: 'institution', label: 'By institution', to: '/staff/reports/institution' },
  { view: 'trend', label: 'Revenue trend', to: '/staff/reports/trend' },
]

/**
 * Management reports. Each view reads the in-memory billing store; Download PDF prints the view
 * and Download CSV exports it, standing in for the API's exports.
 */
export function ReportsPage({ view = 'summary' }: { view?: ReportView }) {
  return (
    <>
      <nav aria-label="Reports" className="mb-5 flex gap-1 border-b border-line print:hidden">
        {tabs.map((t) => (
          <Link
            key={t.view}
            to={t.to}
            aria-current={view === t.view ? 'page' : undefined}
            className={cn('-mb-px border-b-2 px-4 py-2.5 font-medium', view === t.view ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text')}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="mb-3 hidden text-xs text-text-3 print:block">
        Secure Bangla QR · Relief Validation Limited · Generated {stampNow()} · Not a tax invoice
      </p>
      {view === 'summary' && <SummaryView />}
      {view === 'institution' && <InstitutionView />}
      {view === 'trend' && <TrendView />}
    </>
  )
}
