// Coverage-hardening tests (Phase 11) for `PopupController` paths the Phase 7 suite leaves open: the
// view-navigation promise (`gotoView` -> `refreshview` -> resolve/reject), `onLoadPopupContent`'s
// missing-applet throw and its MVG-assoc instance tracking, the 17+ URL rewrite branch, and the
// `closePopupApplet` / `checkOpenedPopup` fallbacks. `reInitPopupPM` stays uncovered by design (see the
// note in popupController.test.ts: the mock PM is an ES6 class and cannot be re-invoked without `new`).
import { describe, it, expect, afterEach } from 'vitest'
import { PopupController, PopupApplet, PopupError, type PopupResolution } from 'siebel-connect'
import { createMockSiebel, makePropertySet, type MockAppletDef } from 'siebel-connect/testing'
import { accountListFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  PopupController.resetInstanceForTesting()
  siebel?.destroy()
  siebel = undefined
})

function setup(applets: MockAppletDef[] = [accountListFixture]) {
  siebel = createMockSiebel({ applets })
  return siebel
}

describe('PopupController: gotoView promise', () => {
  it('resolves true once the matching view loads', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    // The mock active view is always named "Mock Active View"; target it so refreshview resolves.
    const promise = ctrl.gotoView(null, () => undefined, 'Mock Active View')
    s.fireEvent('refreshview')
    await expect(promise).resolves.toBe(true)
  })

  it('rejects when the loaded view name does not match the target', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    const promise = ctrl.gotoView(null, () => undefined, 'Some Other View')
    s.fireEvent('refreshview')
    await expect(promise).rejects.toMatch(/does not match target/)
  })

  it('invokes the navigation function with the forwarded ctx and args', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    const calls: unknown[] = []
    const promise = ctrl.gotoView(
      null,
      (view, applet, id) => calls.push([view, applet, id]),
      'Mock Active View',
      'AppletX',
      'row-9'
    )
    s.fireEvent('refreshview')
    await promise
    expect(calls).toEqual([['Mock Active View', 'AppletX', 'row-9']])
  })
})

describe('PopupController: onLoadPopupContent', () => {
  it('throws when a popup load fires but no applet is open', () => {
    const s = setup()
    const ctrl = PopupController.instance
    ctrl.resolvePromise = () => {} // pretend a popup is pending
    // No currPopups, so IsPopupOpen() reports closed and the load handler cannot find the applet.
    expect(() => s.fireEvent('refreshpopup')).toThrow(PopupError)
  })

  it('tracks the MVG-assoc instance separately from the popup instance', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    const popupNb = new PopupApplet({ pm: s.getPM('Account List Applet'), isPopup: true })
    const assocNb = new PopupApplet({
      pm: s.getPM('Account List Applet'),
      isPopup: true,
      isMvgAssoc: true,
    })
    window.SiebelAppFacade.NB = { popup: popupNb, assoc: assocNb }

    const promise = ctrl.showPopupApplet(
      true,
      undefined,
      popupNb,
      'EditField'
    ) as Promise<PopupResolution>
    // Two currPopups => IsPopupOpen reports an assoc applet, so the assoc NB is routed separately.
    s.setCurrPopups(['MVG Applet', 'Assoc Applet'])
    s.fireEvent('refreshpopup')

    const res = await promise
    expect(res.nexusPopupApplet).toBe(popupNb)
    expect(res.nexusAssocApplet).toBe(assocNb)
  })
})

describe('PopupController: processNewPopup URL rewrite (17+)', () => {
  it('rebuilds the URL off the app extension when there is no start.swe segment', () => {
    const s = setup()
    const ctrl = PopupController.instance
    const popupPM = s.getPopupPM()
    ctrl.isPopupHidden = true
    window.SiebelApp.S_App.ProcessNewPopup(makePropertySet({ URL: 'http://host/app.swe/content' }))
    // GetPageURL() ('https://mock.siebel/') + everything after the '.swe' app extension.
    expect(popupPM.Get('url')).toBe('https://mock.siebel//content')
  })
})

describe('PopupController: closePopupApplet fallback', () => {
  it('falls back to the tracked popupApplet when no nb is passed', () => {
    const s = setup()
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    ctrl.popupApplet = nb
    expect(ctrl.closePopupApplet()).toBe(true)
    expect(ctrl.popupApplet).toBeNull() // cleared after closing
  })
})

describe('PopupController: checkOpenedPopup closes when asked', () => {
  it('routes into closePopupApplet when open and closeIfOpen is set', () => {
    const s = setup()
    const ctrl = PopupController.instance
    ctrl.popupApplet = new PopupApplet({ pm: s.getPM('Account List Applet') })
    s.setCurrPopups(['Pick Applet']) // isOpen === true
    expect(ctrl.checkOpenedPopup(true)).toBe(true)
  })
})

describe('PopupController: hidden export / assoc promises', () => {
  it('showExportApplet parks a promise when hidden', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    const promise = ctrl.showExportApplet(true, undefined, nb)
    expect(promise).toBeInstanceOf(Promise)
    expect(ctrl.canOpenPopup()).toBe(false)
    ;(ctrl.resolvePromise as (v: PopupResolution) => void)({} as PopupResolution)
    await promise
  })

  it('_openAssocApplet runs the new-record fn and parks a promise when hidden', async () => {
    setup()
    const ctrl = PopupController.instance
    let ran = false
    const promise = ctrl._openAssocApplet(true, () => {
      ran = true
    })
    expect(ran).toBe(true)
    expect(promise).toBeInstanceOf(Promise)
    ;(ctrl.resolvePromise as (v: PopupResolution) => void)({} as PopupResolution)
    await promise
  })
})
