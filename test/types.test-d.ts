import { describe, it, expectTypeOf } from 'vitest'
import type {
  AppletKey,
  ConnectSettings,
  ControlModel,
  PaginationInfo,
  RecordOf,
  SiebelRecord,
  SubscriptionToken,
} from 'siebel-connect'

interface Account extends SiebelRecord {
  Name: string
}

// Augment via the public package name — exactly as a real consumer would (and as the docs show).
declare module 'siebel-connect' {
  interface AppletRegistry {
    accountList: Account
  }
}

describe('registry inference', () => {
  it('RecordOf resolves the augmented record', () => {
    expectTypeOf<RecordOf<'accountList'>>().toEqualTypeOf<Account>()
  })

  it('AppletKey is the union of registered keys', () => {
    expectTypeOf<AppletKey>().toEqualTypeOf<'accountList'>()
  })

  it('SiebelRecord.Id is a string', () => {
    expectTypeOf<SiebelRecord['Id']>().toBeString()
  })
})

describe('SubscriptionToken branding', () => {
  it('is usable as the underlying string | number', () => {
    expectTypeOf<SubscriptionToken>().toMatchTypeOf<string | number>()
  })

  it('cannot be satisfied by a raw string | number', () => {
    // The load-bearing guarantee: a plain primitive is NOT a valid token.
    expectTypeOf<string | number>().not.toMatchTypeOf<SubscriptionToken>()
  })
})

describe('no any leaks in the public surface', () => {
  it('registry-driven and model types are never any', () => {
    expectTypeOf<RecordOf<'accountList'>>().not.toBeAny()
    expectTypeOf<ControlModel>().not.toBeAny()
    expectTypeOf<PaginationInfo>().not.toBeAny()
    expectTypeOf<ConnectSettings['debug']>().not.toBeAny()
  })

  it('the Siebel boundary is unknown, not any', () => {
    // SiebelPresentationModel is an ambient global from siebel-globals.d.ts.
    expectTypeOf<ReturnType<SiebelPresentationModel['Get']>>().toBeUnknown()
  })
})
