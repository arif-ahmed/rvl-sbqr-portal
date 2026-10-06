import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// The billing screens read a dozen endpoints before their first paint; a slow CI box needs more than the 1s default.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})
