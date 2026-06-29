// Type-level tests for the factory's registry-driven inference. The load-bearing guarantee of the
// whole rewrite: `getApplet(key)` / `getPopup(key)` infer the registered record type from the
// augmented `AppletRegistry`, with no `any` at the public door.
import { describe, it, expectTypeOf } from 'vitest'
import { getApplet, getPopup, Applet, PopupApplet } from 'siebel-connect'
import type { SiebelRecord } from 'siebel-connect'

interface Invoice extends SiebelRecord {
  Amount: number
}

declare module 'siebel-connect' {
  interface AppletRegistry {
    invoiceList: Invoice
  }
}

describe('factory inference', () => {
  it('getApplet returns Applet<RecordOf<K>> for the registered key', () => {
    expectTypeOf(getApplet('invoiceList')).toEqualTypeOf<Applet<Invoice>>()
  })

  it('getPopup returns PopupApplet<RecordOf<K>> for the registered key', () => {
    expectTypeOf(getPopup('invoiceList')).toEqualTypeOf<PopupApplet<Invoice>>()
  })

  it('the inferred record flows through the applet accessors', () => {
    expectTypeOf(getApplet('invoiceList').getCurrentRecord()).toEqualTypeOf<Invoice | undefined>()
    expectTypeOf(getApplet('invoiceList').getRecordSet()).toEqualTypeOf<Invoice[]>()
  })

  it('no any leaks at the door', () => {
    expectTypeOf(getApplet('invoiceList')).not.toBeAny()
    expectTypeOf(getApplet('invoiceList').getRecordSet()).not.toBeAny()
  })
})
