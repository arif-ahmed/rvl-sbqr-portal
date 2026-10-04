import * as Menu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '../../../shared/ui'
import { actionLabel, actionsFor, type ActionId } from './actions'
import type { Institution } from './types'

/** The main next step as a button plus the rest in a "more" menu. Used by the list rows and the detail page. */
export function ActionButtons({ inst, onAction }: { inst: Institution; onAction: (i: Institution, a: ActionId) => void }) {
  const { primary, menu } = actionsFor(inst)
  return (
    // The list row opens the detail page on click; actions must not.
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      {primary && (
        <Button size="sm" variant={primary === 'continue' || primary === 'activate' ? 'primary' : 'default'} onClick={() => onAction(inst, primary)}>
          {actionLabel[primary]}
        </Button>
      )}
      {menu.length > 0 && (
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button size="sm" variant="ghost" aria-label={`More actions for ${inst.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content align="end" sideOffset={6} className="z-50 min-w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
              {menu.map((a) => (
                <Menu.Item
                  key={a}
                  onSelect={() => onAction(inst, a)}
                  className={`cursor-pointer px-4 py-2.5 outline-none data-[highlighted]:bg-surface-2 ${a === 'terminate' ? 'text-bad' : ''}`}
                >
                  {actionLabel[a]}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  )
}
