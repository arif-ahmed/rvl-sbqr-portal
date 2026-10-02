export type ThemeMode = 'auto' | 'light' | 'dark'

const KEY = 'sbqr-theme'
const order: ThemeMode[] = ['auto', 'light', 'dark']

export function getTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(mode: ThemeMode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = mode
}

/** auto -> light -> dark -> auto. The preference is not sensitive, so localStorage is fine. */
export function cycleTheme(): ThemeMode {
  const next = order[(order.indexOf(getTheme()) + 1) % order.length]
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode: theme still applies for this page view */
  }
  applyTheme(next)
  return next
}
