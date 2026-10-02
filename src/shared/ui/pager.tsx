import { Button } from './button'

/** Prev/Next with "Page x of y". Renders nothing when everything fits on one page. */
export function Pager({ total, page, perPage, onPage }: { total: number; page: number; perPage: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (pages === 1) return null
  return (
    <nav aria-label="Pagination" className="flex items-center gap-3 border-t border-line px-5 py-3 text-[13px] text-text-2">
      <span>
        Page {page} of {pages}
      </span>
      <span className="flex-1" />
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
