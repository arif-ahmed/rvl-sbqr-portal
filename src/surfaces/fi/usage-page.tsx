import { sampleEvents, sampleFiInstitutionId } from '../../shared/usage/sample'
import { UsageTable } from '../../shared/usage/usage-table'

// UI only: until the API exists the FI user is a fixed sample institution.
const events = sampleEvents.filter((e) => e.institutionId === sampleFiInstitutionId)

/** Every QR generation and validation made with this institution's credentials. */
export function UsagePage() {
  return (
    <>
      <p className="mb-4 max-w-2xl text-text-2">
        Every QR generation and validation made with your credentials. Validations are billed only when the verdict is conclusive (valid or invalid).
      </p>
      <UsageTable events={events} />
    </>
  )
}
