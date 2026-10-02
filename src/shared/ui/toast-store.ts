export type Item = { id: number; text: string; bad: boolean }
let items: Item[] = []
export const getToasts = () => items
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function push(text: string, bad: boolean) {
  const id = next++
  items = [...items, { id, text, bad }]
  emit()
  setTimeout(() => {
    items = items.filter((i) => i.id !== id)
    emit()
  }, 3000)
}

/** toast.success('Saved') / toast.error('Could not save'). Render <Toaster /> once at the app root. */
export const toast = { success: (t: string) => push(t, false), error: (t: string) => push(t, true) }

export const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
