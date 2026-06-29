// Behavioural-parity tests for the ported `PopupApplet` (Phase 07). PopupApplet adds only the popup
// record-shuttle operations on top of BaseApplet; each test asserts the operation drives the right PM
// `InvokeMethod` and fires the optional callback, plus the `_firstRecord` positioning guard.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { PopupApplet } from 'siebel-connect'
import { createMockSiebel, type MockAppletDef } from 'siebel-connect/testing'
import { accountListFixture, contactFormFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  siebel?.destroy()
  siebel = undefined
})

/** Build a PopupApplet over a fresh mock, recording every `InvokeMethod` name the bridge drives. */
function makePopup(base: MockAppletDef = accountListFixture) {
  const invoked: string[] = []
  const def: MockAppletDef = {
    ...base,
    executeMethod: (name, args) => {
      if (name === 'InvokeMethod') invoked.push(String(args[0]))
      return undefined // fall through to the harness defaults
    },
  }
  siebel = createMockSiebel({ applets: [def] })
  const popup = new PopupApplet({ pm: siebel.getPM(def.name) })
  return { popup, invoked }
}

describe('PopupApplet: record-shuttle operations', () => {
  it('pickRecord invokes PickRecord', () => {
    const { popup, invoked } = makePopup()
    popup.pickRecord()
    expect(invoked).toContain('PickRecord')
  })

  it('addRecords / addAllRecords invoke their PM methods and fire the callback', () => {
    const { popup, invoked } = makePopup()
    const addCb = vi.fn()
    const addAllCb = vi.fn()
    popup.addRecords(addCb)
    popup.addAllRecords(addAllCb)
    expect(invoked).toEqual(['AddRecords', 'AddAllRecords'])
    expect(addCb).toHaveBeenCalledOnce()
    expect(addAllCb).toHaveBeenCalledOnce()
  })

  it('deleteRecords / deleteAllRecords invoke their PM methods and fire the callback', () => {
    const { popup, invoked } = makePopup()
    const delCb = vi.fn()
    const delAllCb = vi.fn()
    popup.deleteRecords(delCb)
    popup.deleteAllRecords(delAllCb)
    expect(invoked).toEqual(['DeleteRecords', 'DeleteAllRecords'])
    expect(delCb).toHaveBeenCalledOnce()
    expect(delAllCb).toHaveBeenCalledOnce()
  })

  it('the callback is optional', () => {
    const { popup, invoked } = makePopup()
    expect(() => popup.addRecords()).not.toThrow()
    expect(invoked).toEqual(['AddRecords'])
  })
})

describe('PopupApplet: _firstRecord', () => {
  it('returns true without positioning when already on the first row', () => {
    const { popup, invoked } = makePopup()
    // list fixture defaults selection to 0, so no PositionOnRow/HandleRowSelect is needed.
    expect(popup._firstRecord()).toBe(true)
    expect(invoked).toEqual([])
  })

  it('positions on row 0 when the selection is elsewhere', () => {
    siebel = createMockSiebel({ applets: [accountListFixture] })
    const pm = siebel.getPM('Account List Applet')
    pm.set('GetSelection', 1)
    const popup = new PopupApplet({ pm })
    expect(popup._firstRecord()).toBe(true)
    expect(pm.Get('GetSelection')).toBe(0)
  })

  it('returns false on a form (non-list) applet', () => {
    siebel = createMockSiebel({ applets: [contactFormFixture] })
    const popup = new PopupApplet({ pm: siebel.getPM('Contact Form Applet') })
    expect(popup._firstRecord()).toBe(false)
  })
})
