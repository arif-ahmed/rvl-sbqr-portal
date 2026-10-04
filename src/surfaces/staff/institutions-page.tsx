import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Role } from '../../shared/auth/session'
import { errorMessage } from '../../shared/api/client'
import { Banner, Card, EmptyRow, Input, Select, StatusChip, Table, Td, Th, Tr } from '../../shared/ui'
import { institutionNote } from './institutions/actions'
import { ActionButtons } from './institutions/action-buttons'
import { useInstitutionActions } from './institutions/use-institution-actions'
import { useInstitutionList } from './institutions/api/hooks'
import type { InstitutionStatus } from './institutions/types'
import { institutionTypes, typeLabel } from './onboarding/institution-types'

const statuses: InstitutionStatus[] = ['Pending', 'Active', 'Suspended', 'Terminated']

/** Institutions list, read from the tenants API. Lifecycle actions call the API and the list refetches. */
export function InstitutionsPage({ role }: { role: Role }) {
  const navigate = useNavigate()
  const list = useInstitutionList()
  const institutions = list.data ?? []
  const canManage = role === 'admin'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const { run, dialogs } = useInstitutionActions()

  const q = query.trim().toLowerCase()
  const rows = institutions.filter(
    (i) => (!q || i.name.toLowerCase().includes(q) || i.code.startsWith(q)) && (!status || i.status === status) && (!type || i.type === type),
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search institutions" placeholder="Search name or code" className="w-full sm:w-64" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {institutionTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label.split(' (')[0]}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        {canManage && (
          <Link
            to="/staff/institutions/new"
            className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-accent bg-accent px-4 font-medium text-on-accent hover:border-accent-strong hover:bg-accent-strong"
          >
            <Plus className="size-4" aria-hidden /> Add institution
          </Link>
        )}
      </div>

      {list.isError && (
        <Banner tone="bad" title="Could not load institutions">
          {errorMessage(list.error)}{' '}
          <button type="button" className="font-semibold underline" onClick={() => void list.refetch()}>
            Try again
          </button>
        </Banner>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Institution</Th>
              <Th>Type</Th>
              <Th>Code</Th>
              <Th>Access</Th>
              <Th>Status</Th>
              {canManage && <Th right>Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {list.isPending && <EmptyRow cols={canManage ? 6 : 5} title="Loading institutions…" />}
            {!list.isPending && !list.isError && rows.length === 0 && <EmptyRow cols={canManage ? 6 : 5} title="No institutions match" hint="Clear the search or filters." />}
            {rows.map((inst) => {
              const note = institutionNote(inst)
              return (
                // The name is a real link for keyboard and screen readers; the row click is the mouse shortcut.
                <Tr key={inst.id} onClick={() => navigate(`/staff/institutions/${inst.id}`)}>
                  <Td>
                    <Link to={`/staff/institutions/${inst.id}`} className="block font-bold hover:underline">
                      {inst.name}
                    </Link>
                    {note && <small className={note.warn ? 'text-warn' : 'text-text-3'}>{note.text}</small>}
                  </Td>
                  <Td>{typeLabel(inst.type).split(' (')[0]}</Td>
                  <Td className="num">{inst.code}</Td>
                  <Td className="text-text-2">
                    {inst.access ? [inst.access.generation && 'Generation', inst.access.validation && 'Validation'].filter(Boolean).join(' · ') : 'Not set up'}
                  </Td>
                  <Td>
                    <StatusChip status={inst.status} />
                  </Td>
                  {canManage && (
                    <Td>
                      <ActionButtons inst={inst} onAction={run} />
                    </Td>
                  )}
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
      {dialogs}
    </>
  )
}
