// Behavioural-parity tests for the ported `Applet` (Phase 08, was `Nexus`). These exercise the
// observable contract added on top of `BaseApplet`: the popup-opening guards (control-found, UI-type,
// query-mode, canOpenPopup), the `drilldown` list-vs-form branch, the `gotoView` SWE-command string,
// `CreatePopupNB` building a `PopupApplet`, and the user-preference round-trip.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  Applet,
  PopupApplet,
  PopupController,
  ConnectError,
  ControlNotFoundError,
  MethodNotSupportedError,
  PopupError,
  QueryModeError,
} from 'siebel-connect'
import { createMockSiebel, type MockAppletDef } from 'siebel-connect/testing'
import { accountListFixture, contactFormFixture } from './fixtures/applets'

// A form applet carrying one control of each popup-relevant UI type, so the guard branches are
// reachable: MVG, Pick, a plain Text (always the wrong type), and two Buttons (valid/invalid method).
const mvgFormFixture: MockAppletDef = {
  name: 'MVG Form Applet',
  isList: false,
  controls: {
    Contacts: { name: 'Contacts', uiType: 'SWE_CTRL_MVG', fieldName: 'Contacts' },
    Account: { name: 'Account', uiType: 'SWE_CTRL_PICK', fieldName: 'Account' },
    Plain: { name: 'Plain', uiType: 'Text', fieldName: 'Plain' },
    Pop: { name: 'Pop', uiType: 'Button', methodName: 'ShowPopup' },
    PopBad: { name: 'PopBad', uiType: 'Button', methodName: 'Other' },
  },
  records: [{ Id: '3-A', Contacts: '', Account: '' }],
}

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  // Applet's constructor grabs the PopupController singleton; drop it so each test reconstructs fresh.
  PopupController.resetInstanceForTesting()
  siebel?.destroy()
  siebel = undefined
})

function setup(applets: MockAppletDef[] = [mvgFormFixture, accountListFixture, contactFormFixture]) {
  siebel = createMockSiebel({ applets })
  return siebel
}

function makeApplet(appletName: string) {
  const s = siebel ?? setup()
  return new Applet({ pm: s.getPM(appletName) })
}

describe('Applet: showMvgApplet', () => {
  it('throws ControlNotFoundError when the control does not exist', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showMvgApplet('Nope', false)).toThrow(ControlNotFoundError)
    expect(() => applet.showMvgApplet('Nope', false)).toThrow(
      '[NB] Cannot find a control by name Nope to show Mvg applet.'
    )
  })

  it('throws ConnectError when the control is the wrong UI type', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showMvgApplet('Plain', false)).toThrow(ConnectError)
    expect(() => applet.showMvgApplet('Plain', false)).toThrow(
      'Control Plain is not of supported type Text to show Mvg applet'
    )
  })

  it('throws QueryModeError when the applet is in query mode', () => {
    setup([{ ...mvgFormFixture, inQueryMode: true }])
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showMvgApplet('Contacts', false)).toThrow(QueryModeError)
    expect(() => applet.showMvgApplet('Contacts', false)).toThrow(
      '[NB] Mvg applet cannot be opened in query mode'
    )
  })

  it('opens the edit popup for a valid MVG control', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    // hide = false returns the synchronous InvokeMethod result (the mock returns true).
    expect(applet.showMvgApplet('Contacts', false)).toBe(true)
  })
})

describe('Applet: showPickApplet', () => {
  it('throws ConnectError when the control is the wrong UI type', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showPickApplet('Plain', false)).toThrow(
      'Control Plain is not of supported type Text to show Pick applet'
    )
  })

  it('opens the edit popup for a valid Pick control', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(applet.showPickApplet('Account', false)).toBe(true)
  })
})

describe('Applet: showPopup', () => {
  it('throws ConnectError when the control is not a Button', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showPopup('Plain', false)).toThrow(
      'Control Plain is not of supported type Text to show Popup applet'
    )
  })

  it('throws ConnectError when the Button method is not ShowPopup', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.showPopup('PopBad', false)).toThrow('Control PopBad method is not ShowPopup')
  })

  it('opens the popup for a valid ShowPopup Button', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    expect(applet.showPopup('Pop', false)).toBe(true)
  })
})

describe('Applet: popup open guards', () => {
  it('throws PopupError from showPopupApplet when another popup is opening', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    // Park a pending resolve so canOpenPopup() returns false.
    applet.popupController.resolvePromise = () => {}
    expect(() => applet.showPopupApplet('EditPopup', false)).toThrow(PopupError)
    expect(() => applet.showPopupApplet('EditPopup', false)).toThrow(
      '[NB] Cannot open popup, another popup is openning and exists resolve func'
    )
  })

  it('throws MethodNotSupportedError from openAssocApplet when NewRecord is unavailable', () => {
    setup([
      {
        ...mvgFormFixture,
        executeMethod: (name, args) =>
          name === 'CanInvokeMethod' && args[0] === 'NewRecord' ? false : undefined,
      },
    ])
    const applet = makeApplet('MVG Form Applet')
    expect(() => applet.openAssocApplet(false)).toThrow(MethodNotSupportedError)
    expect(() => applet.openAssocApplet(false)).toThrow('[NB] NewRecord is not available')
  })
})

describe('Applet: drilldown', () => {
  it('fires the list drilldown event with the control name and selected index', () => {
    const s = setup()
    const applet = makeApplet('Account List Applet')
    const spy = vi.spyOn(s.getPM('Account List Applet'), 'OnControlEvent')
    applet.drilldown('Name')
    expect(spy).toHaveBeenCalledWith('PHYEVENT_DRILLDOWN_LIST', 'Name', 0)
  })

  it('fires the form drilldown event with the resolved control', () => {
    const s = setup()
    const applet = makeApplet('Contact Form Applet')
    const pm = s.getPM('Contact Form Applet')
    const control = pm.ExecuteMethod('GetControl', 'FirstName')
    const spy = vi.spyOn(pm, 'OnControlEvent')
    applet.drilldown('FirstName')
    expect(spy).toHaveBeenCalledWith('PHYEVENT_DRILLDOWN_FORM', control)
  })

  it('throws ControlNotFoundError on a form applet when the control is missing', () => {
    setup()
    const applet = makeApplet('Contact Form Applet')
    expect(() => applet.drilldown('Nope')).toThrow(ControlNotFoundError)
    expect(() => applet.drilldown('Nope')).toThrow('[NB] Control Nope is not found')
  })
})

describe('Applet: gotoView', () => {
  it('builds the full SWE command for the appletName + id path', () => {
    setup()
    const goto = vi.fn()
    window.SiebelApp.S_App.GotoView = goto
    const applet = makeApplet('MVG Form Applet')

    applet.gotoView('MyView', 'MyApplet', 'row1')

    const expected = encodeURI(
      'GotoView&SWEView=MyView&SWEApplet0=MyApplet&SWEBU=1&SWEKeepContext=FALSE&SWERowId0=row1'
    )
    expect(goto).toHaveBeenCalledWith('MyView', '', expected, '')
  })

  it('navigates by view name only when applet/id are absent', () => {
    setup()
    const goto = vi.fn()
    window.SiebelApp.S_App.GotoView = goto
    const applet = makeApplet('MVG Form Applet')

    applet.gotoView('MyView')

    expect(goto).toHaveBeenCalledWith('MyView')
  })
})

describe('Applet.CreatePopupNB', () => {
  it('builds a PopupApplet from a popup PM', () => {
    const s = setup()
    const pm = s.getPM('MVG Form Applet')
    pm.set('IsPopup', true)
    const popup = Applet.CreatePopupNB({ pm })
    expect(popup).toBeInstanceOf(PopupApplet)
    expect(popup.isPopup).toBe(true)
    expect(popup.isMvgAssoc).toBe(false)
  })

  it('throws PopupError when the PM is not a popup PM', () => {
    const s = setup()
    expect(() => Applet.CreatePopupNB({ pm: s.getPM('MVG Form Applet') })).toThrow(PopupError)
    expect(() => Applet.CreatePopupNB({ pm: s.getPM('MVG Form Applet') })).toThrow(
      '[NB] No pm or the given pm is not popup applet PM'
    )
  })
})

describe('Applet: user preferences', () => {
  it('round-trips a user preference through the PM', () => {
    setup()
    const applet = makeApplet('MVG Form Applet')
    applet.saveUserPref('MyPref', 'kept')
    expect(applet.getUserPref('MyPref')).toBe('kept')
  })
})
