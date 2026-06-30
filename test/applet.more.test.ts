// Coverage-hardening tests (Phase 11) for the thin `Applet` delegations the Phase 8 suite skips:
// closePopupApplet, changeRecords, the gotoView*Promised view-promise wrappers, reInitPopup (instance +
// static), and the `CreatePopupNB` MVG-assoc branch. Each just forwards to the PopupController, so the
// assertions check the hand-off, with `reInitPopupPM` stubbed (its PM-lifecycle dance is unmockable here,
// see popupController.test.ts).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Applet, PopupApplet, PopupController } from 'siebel-connect'
import { createMockSiebel } from 'siebel-connect/testing'
import { accountListFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  PopupController.resetInstanceForTesting()
  siebel?.destroy()
  siebel = undefined
})

function setup() {
  siebel = createMockSiebel({ applets: [accountListFixture] })
  return siebel
}

function makeApplet() {
  const s = siebel ?? setup()
  return new Applet({ pm: s.getPM('Account List Applet') })
}

describe('Applet: closePopupApplet', () => {
  it('delegates to the controller, closing the given popup instance', () => {
    const s = setup()
    const applet = makeApplet()
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    expect(applet.closePopupApplet(nb)).toBe(true)
  })
})

describe('Applet: changeRecords', () => {
  it('delegates to showPopupApplet with the ChangeRecords method', () => {
    setup()
    const applet = makeApplet()
    const spy = vi.spyOn(applet, 'showPopupApplet')
    applet.changeRecords(false)
    expect(spy).toHaveBeenCalledWith('ChangeRecords', false, undefined)
  })
})

describe('Applet: gotoViewPromised', () => {
  it('resolves once the target view loads', async () => {
    const s = setup()
    window.SiebelApp.S_App.GotoView = vi.fn()
    const applet = makeApplet()
    const promise = applet.gotoViewPromised('Mock Active View')
    s.fireEvent('refreshview')
    await expect(promise).resolves.toBe(true)
  })

  it('static GotoViewPromised resolves through the singleton controller', async () => {
    const s = setup()
    window.SiebelApp.S_App.GotoView = vi.fn()
    const promise = Applet.GotoViewPromised('Mock Active View')
    s.fireEvent('refreshview')
    await expect(promise).resolves.toBe(true)
  })
})

describe('Applet: reInitPopup', () => {
  it('forwards to the controller (instance and static)', () => {
    setup()
    const applet = makeApplet()
    const spy = vi.spyOn(applet.popupController, 'reInitPopupPM').mockImplementation(() => {})
    applet.reInitPopup()
    Applet.ReInitPopup()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('Applet.CreatePopupNB: MVG-assoc detection', () => {
  it('flags isMvgAssoc when the shuttle assoc applet matches the PM', () => {
    const s = setup()
    const pm = s.getPM('Account List Applet')
    pm.set('IsPopup', true)
    const popupPM = s.getPopupPM()
    popupPM.set('isPopupMVGAssoc', true)
    popupPM.set('MVGAssocAppletObject', { GetName: () => 'Account List Applet' })

    const popup = Applet.CreatePopupNB({ pm })
    expect(popup.isMvgAssoc).toBe(true)
  })
})
