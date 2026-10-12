import { Plus } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../../shared/api/client'
import { bdtRate, periodName } from '../../../shared/format'
import { Banner, Button, Card, ConfirmDialog, EmptyRow, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { useInstitutions } from '../institutions/api/hooks'
import { useAllRateCards, useWithdrawRateCard } from './api/hooks'
import { NewRateCardDrawer } from './new-rate-card-drawer'
import { canWithdraw, cardState, currentMonth, priceGaps, type Operation, type RateCard } from './rates'

/** Per-call prices for each institution. Backed by the rate-cards API
 *  (`GET /v1/admin/billing/rate-cards?tenantId=…` fanned out per Active institution). */
export function RatesPage() {
  const institutions = useInstitutions()
  const { items: cards, error } = useAllRateCards()
  const withdraw = useWithdrawRateCard()
  const [adding, setAdding] = useState(false)
  const [withdrawing, setWithdrawing] = useState<RateCard | null>(null)
  const name = (id: string) => institutions.find((i) => i.id === id)?.name ?? id

  const rows = [...cards].sort((a, b) => name(a.institutionId).localeCompare(name(b.institutionId)) || b.effectiveFrom.localeCompare(a.effectiveFrom))
  const month = currentMonth()
  const gaps = institutions
    .filter((i) => i.status === 'Active')
    .map((i) => ({ inst: i, gaps: priceGaps(i.access, cards, i.id, month) }))
    .filter((g) => g.gaps.length > 0)
  const unpriced = gaps.filter((g) => g.gaps.some((x) => x.reason === 'no-card'))
  const free = gaps.filter((g) => g.gaps.some((x) => x.reason === 'zero-price'))
  const unused = (c: RateCard, op: Operation) => {
    const access = institutions.find((i) => i.id === c.institutionId)?.access
    return !!access && !access[op]
  }
  const price = (c: RateCard, op: Operation) => (
    <>
      {bdtRate(op === 'generation' ? c.generationRate : c.validationRate)}
      {unused(c, op) && <small className="block text-text-3">not used</small>}
    </>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-text-2">
          Per-call prices for each institution. A card applies from its start month until the next card starts. Changes never alter a finalized month.
        </p>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> New rate card
        </Button>
      </div>

      {error && <Banner tone="bad" title="Could not load rate cards">{errorMessage(error)}</Banner>}

      {unpriced.length > 0 && (
        <Banner tone="info" title={`${unpriced.length} active ${unpriced.length === 1 ? 'institution has' : 'institutions have'} no rate card`}>
          {unpriced.map((g) => g.inst.name).join(', ')}. Their usage is recorded, but no statement is produced until a card takes effect.
        </Banner>
      )}
      {free.length > 0 && (
        <Banner tone="warn" title="Priced at ৳0 this month">
          {free
            .map((g) => `${g.inst.name} (${g.gaps.filter((x) => x.reason === 'zero-price').map((x) => x.operation).join(' and ')})`)
            .join(', ')}
          . These operations are allowed but free. A started card cannot be changed, so schedule a new card to charge from next month.
        </Banner>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Institution</Th>
              <Th>Starts</Th>
              <Th right>Generation / call</Th>
              <Th right>Validation / call</Th>
              <Th>State</Th>
              <Th right>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} title="No rate cards yet" hint="Add one to start billing an institution." />}
            {rows.map((c) => {
              const state = cardState(c, cards)
              return (
                <Tr key={c.id}>
                  <Td className="font-bold">{name(c.institutionId)}</Td>
                  <Td className="whitespace-nowrap">{periodName(c.effectiveFrom.slice(0, 7))}</Td>
                  <Td right>{price(c, 'generation')}</Td>
                  <Td right>{price(c, 'validation')}</Td>
                  <Td>{state === 'Superseded' ? <span className="text-text-3">Superseded</span> : <StatusChip status={state} />}</Td>
                  <Td right>
                    {canWithdraw(c, cards) ? (
                      <Button size="sm" variant="danger" aria-label={`Withdraw rate card for ${name(c.institutionId)} from ${periodName(c.effectiveFrom.slice(0, 7))}`} onClick={() => setWithdrawing(c)}>
                        Withdraw
                      </Button>
                    ) : (
                      <span className="text-[12.5px] text-text-3">Locked</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
          Only a card that has not started can be withdrawn. Once it takes effect it is locked, and statements always use the card in effect for their month.
        </p>
      </Card>

      <NewRateCardDrawer open={adding} onClose={() => setAdding(false)} />
      {withdrawing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setWithdrawing(null)}
          title="Withdraw rate card?"
          description={`${name(withdrawing.institutionId)} will no longer be priced from ${periodName(withdrawing.effectiveFrom.slice(0, 7))}. The earlier card keeps applying.`}
          confirmLabel="Withdraw"
          danger
          onConfirm={() => {
            const card = withdrawing
            setWithdrawing(null)
            withdraw.mutate(
              { id: card.id, tenantId: card.institutionId },
              {
                onSuccess: () => toast.success('Rate card withdrawn'),
                onError: (e) => toast.error(errorMessage(e, 'Could not withdraw the rate card.')),
              },
            )
          }}
        />
      )}
    </>
  )
}