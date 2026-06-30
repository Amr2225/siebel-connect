// Behavioural tests for the framework-agnostic applet store (Phase 10). The store adapts a
// `BaseApplet`'s BC-notification subscription into the `useSyncExternalStore` contract. These assert
// the two properties the React layer relies on: stable snapshot identity between notifications, and a
// fresh recompute (plus listener fan-out) on each notification batch, and that `destroy` unsubscribes.
import { describe, it, expect, afterEach } from 'vitest'
import { init, getApplet, getAppletStore, clear } from 'siebel-connect'
import { createMockSiebel } from 'siebel-connect/testing'
import { accountListFixture, type Account } from './fixtures/applets'

declare module 'siebel-connect' {
  interface AppletRegistry {
    storeAcct: Account
  }
}

let siebel: ReturnType<typeof createMockSiebel> | undefined

afterEach(() => {
  try {
    clear(['storeAcct'])
  } catch {
    // key may already be cleared by a destructive init in the test
  }
  siebel?.destroy()
  siebel = undefined
})

function setup() {
  siebel = createMockSiebel({ applets: [accountListFixture] })
  init({ storeAcct: accountListFixture.name })
  return siebel
}

describe('createAppletStore via getAppletStore', () => {
  it('returns the same memoized store per key', () => {
    setup()
    expect(getAppletStore('storeAcct')).toBe(getAppletStore('storeAcct'))
  })

  it('snapshot identity is stable between notifications', () => {
    setup()
    const store = getAppletStore('storeAcct')
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('exposes the typed record set with a record index on the snapshot', () => {
    setup()
    const snapshot = getAppletStore('storeAcct').getSnapshot()
    expect(snapshot.recordSet.map((r) => r.Name)).toEqual(['Acme', 'Globex', 'Initech'])
    expect(snapshot.recordSet[0]?._indx).toBe(0)
    expect(snapshot.currentRecord?.Name).toBe('Acme') // selection defaults to 0
  })

  it('recomputes the snapshot and notifies listeners on a BC notification batch', () => {
    const s = setup()
    const store = getAppletStore('storeAcct')
    const before = store.getSnapshot()
    let calls = 0
    const unsubscribe = store.subscribe(() => {
      calls += 1
    })

    s.emitBatch(accountListFixture.name, [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])

    expect(calls).toBe(1)
    expect(store.getSnapshot()).not.toBe(before) // fresh object after the batch
    unsubscribe()
  })

  it('getServerSnapshot is empty and stable (SSR-safe)', () => {
    setup()
    const store = getAppletStore('storeAcct')
    const server = store.getServerSnapshot()
    expect(server.recordSet).toEqual([])
    expect(server.currentRecord).toBeUndefined()
    expect(store.getServerSnapshot()).toBe(server)
  })

  it('destroy unsubscribes from the applet so later batches do not fan out', () => {
    const s = setup()
    const store = getAppletStore('storeAcct')
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })

    store.destroy()
    s.emitBatch(accountListFixture.name, [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])

    expect(calls).toBe(0)
  })

  it('the underlying applet has no subscribers left after destroy', () => {
    setup()
    const store = getAppletStore('storeAcct')
    const applet = getApplet('storeAcct')
    expect(applet.notifications.subscribers.length).toBe(1)
    store.destroy()
    expect(applet.notifications.subscribers.length).toBe(0)
  })
})
