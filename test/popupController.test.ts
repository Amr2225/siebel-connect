// Behavioural-parity tests for the ported `PopupController` (Phase 07). The controller is the
// highest-risk module in the bridge, so these exercise the observable contract: the Symbol-enforced
// singleton, `IsPopupOpen` for 0/1/2 `currPopups`, `canOpenPopup` gating, the hidden-popup resolve
// flow (showPopupApplet -> refreshpopup -> promise resolves), and the `closePopupApplet` guards.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PopupController,
  PopupApplet,
  MethodNotSupportedError,
  PopupError,
  ConnectError,
  type PopupResolution,
} from 'siebel-connect'
import { createMockSiebel, makePropertySet, type MockAppletDef } from 'siebel-connect/testing'
import { accountListFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  // Drop the cached singleton so the next test reconstructs against its own fresh Siebel globals.
  PopupController.resetInstanceForTesting()
  siebel?.destroy()
  siebel = undefined
})

function setup(applets: MockAppletDef[] = [accountListFixture]) {
  siebel = createMockSiebel({ applets })
  return siebel
}

describe('PopupController: singleton', () => {
  it('returns the same instance and refuses direct construction', () => {
    setup()
    const a = PopupController.instance
    const b = PopupController.instance
    expect(a).toBe(b)
    expect(() => new PopupController()).toThrow(
      '[NB] Instantiation failed: get popup controller instance instead of new'
    )
  })
})

describe('PopupController.IsPopupOpen', () => {
  it('reports closed when there are no currPopups', () => {
    setup()
    expect(PopupController.IsPopupOpen()).toEqual({ isOpen: false })
  })

  it('reports the single applet when there is one currPopup', () => {
    const s = setup()
    s.setCurrPopups(['Pick Applet'])
    expect(PopupController.IsPopupOpen()).toMatchObject({ isOpen: true, appletName: 'Pick Applet' })
  })

  it('reports mvg + assoc when there are two currPopups (0 = mvg, 1 = assoc)', () => {
    const s = setup()
    s.setCurrPopups(['MVG Applet', 'Assoc Applet'])
    expect(PopupController.IsPopupOpen()).toMatchObject({
      isOpen: true,
      appletName: 'MVG Applet',
      assocAppletName: 'Assoc Applet',
    })
  })

  it('throws on the unreachable >2 currPopups case', () => {
    const s = setup()
    s.setCurrPopups(['a', 'b', 'c'])
    expect(() => PopupController.IsPopupOpen()).toThrow(ConnectError)
    expect(() => PopupController.IsPopupOpen()).toThrow('[NB] Should never have been here')
  })
})

describe('PopupController: canOpenPopup gating', () => {
  it('is open until a popup promise is pending, then closed', () => {
    const s = setup()
    const ctrl = PopupController.instance
    expect(ctrl.canOpenPopup()).toBe(true)

    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    // hide = true parks a resolve function until refreshpopup fires.
    void ctrl.showPopupApplet(true, undefined, nb, 'EditField')
    expect(ctrl.canOpenPopup()).toBe(false)
  })
})

describe('PopupController: hidden-popup resolve flow', () => {
  it('resolves the showPopupApplet promise on refreshpopup, tracking the NB instance', async () => {
    const s = setup()
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet'), isPopup: true })
    window.SiebelAppFacade.NB = { contactsMvg: nb }

    const promise = ctrl.showPopupApplet(true, undefined, nb, 'EditField') as Promise<PopupResolution>

    // Simulate Siebel opening the popup, then firing the load event.
    s.setCurrPopups(['Contacts MVG Applet'])
    s.fireEvent('refreshpopup')

    const res = await promise
    expect(res.appletName).toBe('Contacts MVG Applet')
    expect(res.nexusPopupApplet).toBe(nb)
  })

  it('rejects immediately when the invoked method returns false', async () => {
    const s = setup([
      {
        ...accountListFixture,
        executeMethod: (name, args) =>
          name === 'InvokeMethod' && args[0] === 'EditField' ? false : undefined,
      },
    ])
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    await expect(ctrl.showPopupApplet(true, undefined, nb, 'EditField')).rejects.toBeUndefined()
  })
})

describe('PopupController: closePopupApplet', () => {
  it('closes the applet when CloseApplet can be invoked', () => {
    const s = setup()
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Account List Applet') })
    expect(ctrl.closePopupApplet(nb)).toBe(true)
  })

  it('throws MethodNotSupportedError when CloseApplet is not allowed', () => {
    const s = setup([
      {
        ...accountListFixture,
        name: 'Guarded Applet',
        executeMethod: (name, args) =>
          name === 'CanInvokeMethod' && args[0] === 'CloseApplet' ? false : undefined,
      },
    ])
    const ctrl = PopupController.instance
    const nb = new PopupApplet({ pm: s.getPM('Guarded Applet') })
    expect(() => ctrl.closePopupApplet(nb)).toThrow(MethodNotSupportedError)
    expect(() => ctrl.closePopupApplet(nb)).toThrow('[NB]The method CloseApplet is not allowed')
  })

  it('throws PopupError when no nb is given and none was opened by NB', () => {
    setup()
    const ctrl = PopupController.instance
    expect(() => ctrl.closePopupApplet()).toThrow(PopupError)
    expect(() => ctrl.closePopupApplet()).toThrow(
      '[NB]The popup applet was not opened by NB and "nb" is not provided'
    )
  })
})

describe('PopupController: ProcessNewPopup interception', () => {
  it('routes the hidden path through processNewPopup: clears currPopups, marks visible, rewrites the URL', () => {
    const s = setup()
    const ctrl = PopupController.instance
    const popupPM = s.getPopupPM()
    s.setCurrPopups(['Stale Popup'])
    ctrl.isPopupHidden = true

    // The controller monkey-patched S_App.ProcessNewPopup at construction; invoke the wrapper.
    const ret = window.SiebelApp.S_App.ProcessNewPopup(
      makePropertySet({ URL: 'http://host/start.swe?SWECmd= X' })
    )

    expect(ret).toBe('refreshpopup')
    expect(ctrl.isPopupHidden).toBe(false) // wrapper resets the flag before delegating
    expect(popupPM.Get('currPopups')).toEqual([])
    expect(popupPM.Get('state')).toBe('POPUP_STATE_VISIBLE')
    expect(popupPM.Get('url')).toBe('https://mock.siebel/?SWECmd= X')
  })

  it('delegates to the stashed original when no popup is hidden', () => {
    setup()
    void PopupController.instance // construct + install the wrapper
    const original = vi.fn(() => 'original-result')
    window.SiebelAppFacade.NexusProcessNewPopup = original

    const ret = window.SiebelApp.S_App.ProcessNewPopup(makePropertySet({ URL: 'x' }))

    expect(original).toHaveBeenCalledOnce()
    expect(ret).toBe('original-result')
  })
})

// NOTE: `reInitPopupPM` is intentionally not unit-tested. Its verbatim `popupPM.constructor({ GetName })`
// re-init call relies on Siebel's ES5 function-style PM constructor (callable without `new`); the mock's
// ES6 `MockPresentationModel` class throws "cannot be invoked without 'new'". Covering it would require a
// function-based popup PM in the harness. The method is ported verbatim and the spec's Tests list does
// not mandate it; tracked as a follow-up harness improvement.

describe('PopupController: checkOpenedPopup', () => {
  it('returns false when nothing is open', () => {
    setup()
    expect(PopupController.instance.checkOpenedPopup(true)).toBe(false)
  })

  it('returns isOpen without closing when closeIfOpen is falsy', () => {
    const s = setup()
    s.setCurrPopups(['Pick Applet'])
    // closeIfOpen omitted: reports open, does not route into closePopupApplet.
    expect(PopupController.instance.checkOpenedPopup()).toBe(true)
  })
})
