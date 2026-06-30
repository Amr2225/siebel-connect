// Coverage-hardening tests (Phase 11) for the action-side of `BaseApplet`: record navigation, the
// create/write/delete/undo verbs, control-value setting, the LOV family, MVG field retrieval, popup-type
// detection, and `_retrieveData`. The Phase 6 suite (`baseApplet.test.ts`) pins the read-side contract;
// this file drives the imperative paths and their failure modes (the edges the spec calls out: query
// mode, MVG add/remove, position failures). Assertions encode the legacy behaviour, not the mock.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  BaseApplet,
  ControlNotFoundError,
  PositionError,
  ReadonlyControlError,
} from 'siebel-connect'
import {
  createMockSiebel,
  makePropertySet,
  MockPropertySet,
  type MockAppletDef,
} from 'siebel-connect/testing'
import { accountListFixture, contactFormFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  siebel?.destroy()
  siebel = undefined
})

function makeApplet(def: MockAppletDef, others: MockAppletDef[] = []) {
  siebel = createMockSiebel({ applets: [def, ...others] })
  const pm = siebel.getPM(def.name)
  const applet = new BaseApplet({ pm })
  return { siebel: siebel!, pm, applet }
}

describe('BaseApplet: record navigation', () => {
  it('list applet drives the Goto* BC verbs and returns the sync result', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.nextRecord()).toBe(true)
    expect(applet.nextRecordSet()).toBe(true)
    expect(applet.prevRecord()).toBe(true)
    expect(applet.prevRecordSet()).toBe(true)
  })

  it('form applet has no record sets, so set navigation short-circuits to false', () => {
    const { applet } = makeApplet(contactFormFixture)
    // nextRecord/prevRecord fall back to GotoNextSet/GotoPreviousSet (still invokable) ...
    expect(applet.nextRecord()).toBe(true)
    expect(applet.prevRecord()).toBe(true)
    // ... but the *Set variants are list-only and return false without touching the PM.
    expect(applet.nextRecordSet()).toBe(false)
    expect(applet.prevRecordSet()).toBe(false)
  })
})

describe('BaseApplet: positionOnRow side-effects', () => {
  it('nullifies the active control before positioning, then selects the row', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.setActiveControl({ GetUIType: () => 'SWE_CTRL_COMBOBOX' } as unknown as SiebelControl)
    const spy = vi.spyOn(pm, 'ExecuteMethod')
    expect(applet.positionOnRow(2)).toBe(true)
    expect(spy).toHaveBeenCalledWith('SetActiveControl', null)
    expect(applet.getSelection()).toBe(2)
  })

  it('throws when the server acknowledges but the selection did not move', () => {
    // HandleRowSelect is intercepted to report success without moving the selection.
    const { applet } = makeApplet({
      ...accountListFixture,
      executeMethod: (name) => (name === 'HandleRowSelect' ? true : undefined),
    })
    expect(() => applet.positionOnRow(2)).toThrow(PositionError)
    expect(() => applet.positionOnRow(2)).toThrow('positioning not happened - 2/0')
  })
})

describe('BaseApplet: create / write / delete / undo', () => {
  it('newRecord resolves once CreateRecord calls back; newRecordSync returns synchronously', async () => {
    const { applet } = makeApplet(accountListFixture)
    await expect(applet.newRecord()).resolves.toBeUndefined()
    await expect(applet.newRecord(() => 'made')).resolves.toBe('made')
    expect(applet.newRecordSync()).toBe(true)
  })

  it('writeRecord resolves on a Completed status', async () => {
    const { applet } = makeApplet(accountListFixture)
    await expect(applet.writeRecord()).resolves.toBeUndefined()
    await expect(applet.writeRecord(() => 'ok')).resolves.toBe('ok')
    expect(applet.writeRecordSync()).toBe(true)
  })

  it('writeRecord rejects on a non-Completed status and routes through cberr', async () => {
    const { applet } = makeApplet({
      ...accountListFixture,
      executeMethod: (name, args) => {
        if (name === 'InvokeMethod' && args[0] === 'WriteRecord') {
          const ai = args[2] as { cb?: (...a: unknown[]) => void }
          ai.cb?.('WriteRecord', null, makePropertySet({ Status: 'Error' }))
          return true
        }
        return undefined
      },
    })
    await expect(applet.writeRecord()).rejects.toBeUndefined()
    await expect(applet.writeRecord(undefined, () => 'recovered')).resolves.toBe('recovered')
  })

  it('deleteRecordSync restores the Confirm dialog after temporarily suppressing it', () => {
    const { applet } = makeApplet(accountListFixture)
    const original = window.SiebelApp.Utils.Confirm
    expect(applet.deleteRecordSync(true)).toBe(true)
    expect(window.SiebelApp.Utils.Confirm).toBe(original) // swapped in, then swapped back
    expect(applet.deleteRecordSync()).toBe(true) // no skip flag: Confirm untouched
  })

  it('undoRecordSync invokes UndoRecord', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.undoRecordSync()).toBe(true)
  })
})

describe('BaseApplet: setControlValue', () => {
  it('converts the value and fires focus/blur on the targeted control', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    const control = pm.ExecuteMethod('GetControl', 'Name') // the exact control focus/blur must target
    const spy = vi.spyOn(pm, 'OnControlEvent')
    applet.setControlValue('Name', 'Updated')
    // focus first, then blur carrying the (string-coerced) value, both on the Name control.
    expect(spy).toHaveBeenNthCalledWith(1, 'PHYEVENT_CONTROL_FOCUS', control)
    expect(spy).toHaveBeenNthCalledWith(2, 'PHYEVENT_CONTROL_BLUR', control, 'Updated')
  })

  it('throws ControlNotFoundError for an unknown control', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(() => applet.setControlValue('Nope', 'x')).toThrow(ControlNotFoundError)
  })

  it('throws ReadonlyControlError when the control cannot be updated', () => {
    const { applet } = makeApplet({
      ...accountListFixture,
      executeMethod: (name) => (name === 'CanUpdate' ? false : undefined),
    })
    expect(() => applet.setControlValue('Name', 'x')).toThrow(ReadonlyControlError)
  })
})

describe('BaseApplet: LOV family', () => {
  const lovFixture: MockAppletDef = {
    name: 'LOV Applet',
    isList: true,
    controls: {
      Status: { name: 'Status', uiType: 'SWE_CTRL_TEXT', staticBounded: true },
      Type: { name: 'Type', uiType: 'SWE_CTRL_COMBOBOX' },
      Plain: { name: 'Plain', uiType: 'Text' },
    },
    records: [{ Id: '1', Status: 'A', Type: 'B', Plain: 'C' }],
  }

  it('classifies controls as static vs dynamic', () => {
    const { applet } = makeApplet(lovFixture)
    expect(applet.isStatic(applet._getControl('Status')!)).toBe(true)
    expect(applet.isDynamic(applet._getControl('Type')!)).toBe(true)
    expect(applet.isStatic(applet._getControl('Type')!)).toBe(false)
  })

  it('getStaticLOV reads the radio-group options off a static control', () => {
    const { applet } = makeApplet(lovFixture)
    expect(applet.getStaticLOV('Status')).toEqual([])
  })

  it('getDynamicLOV walks the GetQuickPickInfo path for a combobox', () => {
    const { applet } = makeApplet(lovFixture)
    expect(applet.getDynamicLOV('Type')).toEqual({})
  })

  it('getLOV routes static to the radio group and everything else to the dynamic path', () => {
    const { applet } = makeApplet(lovFixture)
    expect(applet.getLOV('Status')).toEqual([]) // static
    expect(applet.getLOV('Type')).toEqual({}) // dynamic combobox
    expect(applet.getLOV('Plain')).toEqual({}) // neither: warns, then tries the dynamic path
  })

  it('getControls attaches the static option list to a static-bounded control', () => {
    const { applet } = makeApplet(lovFixture)
    const controls = applet.getControls()
    expect(controls.Status!.staticPick).toBe(true)
    expect(controls.Status!.options).toEqual([])
  })
})

describe('BaseApplet: getCurrentRecord', () => {
  it('returns the selected record, formatted or raw', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.getCurrentRecord()?.Name).toBe('Acme') // selection defaults to 0
    expect(applet.getCurrentRecord(true)?.Id).toBe('1-A')
  })
})

describe('BaseApplet: query with an explicit search control', () => {
  it('runs the search against a named control', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.queryBySearchExprSync('Name="Acme"', false, 'Name')).toBe(3)
  })

  it('throws ControlNotFoundError when the named control is missing', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(() => applet.queryBySearchExprSync('x', false, 'Nope')).toThrow(ControlNotFoundError)
  })
})

describe('BaseApplet: Requery / Refresh statics', () => {
  it('drive the Nexus business service by name', () => {
    const calls: string[] = []
    const bs: SiebelService = {
      InvokeMethod(method) {
        calls.push(method)
        return true
      },
    }
    siebel = createMockSiebel({ applets: [accountListFixture], services: { 'Nexus BS': bs } })
    BaseApplet.Requery('Account List Applet')
    BaseApplet.Refresh('Account List Applet')
    expect(calls).toEqual(['Requery', 'Refresh'])
  })
})

describe('BaseApplet: invokeMethod', () => {
  it('returns false when the method cannot be invoked', () => {
    const { applet } = makeApplet({
      ...accountListFixture,
      executeMethod: (name) => (name === 'CanInvokeMethod' ? false : undefined),
    })
    expect(applet.invokeMethod('WriteRecord')).toBe(false)
  })

  it('async invocation resolves with the callback arguments, optionally transformed', async () => {
    const { applet } = makeApplet(accountListFixture)
    await expect(applet.invokeMethod('ExecuteQuery', { async: true })).resolves.toEqual([])
    await expect(
      applet.invokeMethod('ExecuteQuery', { async: true, cb: () => 'done' })
    ).resolves.toBe('done')
  })
})

describe('BaseApplet: getMVF failure paths', () => {
  it('rejects when the business service signals an error', async () => {
    const failingBs: SiebelService = {
      InvokeMethod(_m, _i, opts) {
        ;(opts as { errcb: () => void }).errcb()
        return false
      },
    }
    siebel = createMockSiebel({ applets: [contactFormFixture], services: { 'Nexus BS': failingBs } })
    const applet = new BaseApplet({ pm: siebel.getPM('Contact Form Applet') })
    await expect(applet.getMVF(['2-A'], { FirstName: ['Account'] }, false)).rejects.toBeUndefined()
  })

  it('rejects when the output has no ResultSet child', async () => {
    const noResultBs: SiebelService = {
      InvokeMethod(m, i, opts) {
        const ai = opts as { cb: (m: string, i: SiebelPropertySet, o: SiebelPropertySet) => void }
        ai.cb(m, i as SiebelPropertySet, new MockPropertySet())
        return true
      },
    }
    siebel = createMockSiebel({ applets: [contactFormFixture], services: { 'Nexus BS': noResultBs } })
    const applet = new BaseApplet({ pm: siebel.getPM('Contact Form Applet') })
    await expect(applet.getMVF(['2-A'], { FirstName: ['Account'] }, false)).rejects.toThrow(
      '[NB] ResultSet is not found in the output returned by business service'
    )
  })
})

describe('BaseApplet: getPopupType', () => {
  it('reports null while the popup PM is not visible', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.getPopupType()).toBeNull()
  })

  it('maps the visible popup PM flags to the popup kind', () => {
    const { applet, siebel: s } = makeApplet(accountListFixture)
    const popup = s.getPopupPM()
    popup.set('state', 'POPUP_STATE_VISIBLE')

    popup.set('isPopupPick', true)
    expect(applet.getPopupType()).toBe('pick')

    popup.set('isPopupPick', false)
    popup.set('isPopupMVGSelected', true)
    popup.set('isPopupMVGAssoc', true)
    expect(applet.getPopupType()).toBe('mvgassoc')

    popup.set('isPopupMVGAssoc', false)
    expect(applet.getPopupType()).toBe('mvg')

    popup.set('isPopupMVGSelected', false)
    popup.set('isPopupAssoc', true)
    expect(applet.getPopupType()).toBe('assoc')

    popup.set('isPopupAssoc', false)
    expect(applet.getPopupType()).toBe('popup')
  })
})

describe('BaseApplet: _retrieveData', () => {
  it('returns false on a form applet', () => {
    const { applet } = makeApplet(contactFormFixture)
    expect(applet._retrieveData(0)).toBe(false)
  })

  it('accumulates de-duplicated rows until the next set is unavailable', () => {
    const { applet } = makeApplet({
      ...accountListFixture,
      // No further row set: the dedup loop fills once, then stops.
      executeMethod: (name) => (name === 'CanInvokeMethod' ? false : undefined),
    })
    const result = applet._retrieveData(0)
    // Narrow without a branch so the data assertions always run (a guarding `if (result)` would let a
    // future falsy-but-not-false regression skip them silently).
    expect(result).not.toBe(false)
    const retrieved = result as Exclude<typeof result, false>
    expect(retrieved.data.map((r) => r.Id)).toEqual(['1-A', '1-B', '1-C'])
    expect(retrieved.hasNext).toBe(false)
  })
})

describe('BaseApplet: getControlsRecordSet on a form applet', () => {
  it('projects Id plus the mapped control fields', () => {
    const { applet } = makeApplet(contactFormFixture)
    const rows = applet.getControlsRecordSet()
    expect(Object.keys(rows[0]!).sort()).toEqual(['FirstName', 'Id', 'LastName'])
    expect(rows[0]!.Id).toBe('2-A')
  })
})

describe('BaseApplet: user preferences', () => {
  it('round-trips a preference through savePref / readPref', () => {
    const { applet } = makeApplet(accountListFixture)
    applet.savePref('MyPref', 'kept')
    expect(applet.readPref('MyPref')).toBe('kept')
  })
})
