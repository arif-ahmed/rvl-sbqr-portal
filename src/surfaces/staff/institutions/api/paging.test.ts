import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend, installFakeBackend } from '../../../../test/fake-backend'
import { fetchAllTenants } from './hooks'

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => backend.reset())

describe('fetchAllTenants', () => {
  it('reads every page, not just the first 100', async () => {
    const seeded = backend.records.length
    for (let i = 0; i < 205; i++) backend.addTenant(String(100000 + i), `Bulk ${i}`)
    const all = await fetchAllTenants()
    expect(all).toHaveLength(seeded + 205)
    expect(new Set(all.map((t) => t.tenantId)).size).toBe(seeded + 205)
    expect(backend.callsTo('GET', '/v1/admin/tenants?page=')).toHaveLength(3)
  })
})
