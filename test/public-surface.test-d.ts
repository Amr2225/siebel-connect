// Type-level guard for the public surface (Phase 11). Complements factory.test-d.ts / types.test-d.ts:
// this file sweeps the *whole* exported door for `any` leaks and pins the store/snapshot inference and
// the typed-error surface, so a future change that widens a return to `any` or breaks registry inference
// fails the typecheck loudly rather than silently eroding the no-`any` guarantee (CLAUDE.md #9).
import { describe, it, expectTypeOf } from 'vitest'
import {
  getApplet,
  getPopup,
  getAppletStore,
  init,
  clear,
  ConnectError,
  AppletNotFoundError,
  type AppletStore,
  type AppletSnapshot,
  type SiebelRecord,
  type CurrentRecordState,
} from 'siebel-connect'

interface Lead extends SiebelRecord {
  Status: string
}

declare module 'siebel-connect' {
  interface AppletRegistry {
    surfaceLead: Lead
  }
}

describe('store inference', () => {
  it('getAppletStore resolves AppletStore<RecordOf<K>> from the registry', () => {
    expectTypeOf(getAppletStore('surfaceLead')).toEqualTypeOf<AppletStore<Lead>>()
  })

  it('the snapshot carries the registered record type', () => {
    const snap = getAppletStore('surfaceLead').getSnapshot()
    expectTypeOf(snap).toEqualTypeOf<AppletSnapshot<Lead>>()
    expectTypeOf(snap.recordSet).toEqualTypeOf<readonly Lead[]>()
    expectTypeOf(snap.currentRecord).toEqualTypeOf<Lead | undefined>()
    expectTypeOf(snap.recordState).toEqualTypeOf<CurrentRecordState>()
    expectTypeOf(snap.inQueryMode).toEqualTypeOf<boolean>()
  })
})

describe('no any leaks across the exported functions', () => {
  it('factory getters are precisely typed, never any', () => {
    expectTypeOf(getApplet('surfaceLead')).not.toBeAny()
    expectTypeOf(getPopup('surfaceLead')).not.toBeAny()
    expectTypeOf(getAppletStore('surfaceLead')).not.toBeAny()
    expectTypeOf(getApplet('surfaceLead').getCurrentRecord()).toEqualTypeOf<Lead | undefined>()
  })

  it('init / clear have concrete void signatures', () => {
    expectTypeOf(init).parameter(0).not.toBeAny()
    expectTypeOf(init).returns.toBeVoid()
    expectTypeOf(clear).parameter(0).toEqualTypeOf<import('siebel-connect').AppletKey[]>()
    expectTypeOf(clear).returns.toBeVoid()
  })
})

describe('typed error surface', () => {
  it('errors are ConnectError subclasses, not any', () => {
    expectTypeOf<AppletNotFoundError>().toMatchTypeOf<ConnectError>()
    expectTypeOf(new ConnectError('x')).toHaveProperty('name')
    expectTypeOf(new ConnectError('x')).not.toBeAny()
  })
})
