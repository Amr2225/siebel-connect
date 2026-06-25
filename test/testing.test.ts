import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createMockSiebel,
  makePropertySet,
  type MockSiebel,
} from 'siebel-connect/testing'
import { accountListFixture, contactFormFixture, allApplets } from './fixtures/applets'

let siebel: MockSiebel | undefined
afterEach(() => {
  siebel?.destroy()
  siebel = undefined
})

describe('createMockSiebel: boot & teardown', () => {
  it('installs the Siebel globals and tears them down cleanly', () => {
    expect('SiebelApp' in window).toBe(false)
    siebel = createMockSiebel({ applets: allApplets })
    expect(window.SiebelApp.S_App.GetActiveView().GetName()).toBe('Mock Active View')
    expect(window.SiebelJS.Dependency('window.SiebelApp.Constants')).toBe(siebel.constants)

    siebel.destroy()
    siebel = undefined
    expect('SiebelApp' in window).toBe(false)
    expect('SiebelJS' in window).toBe(false)
    expect('SiebelAppFacade' in window).toBe(false)
  })

  it('reaches a PM through the active view, the way the factory does', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const view = window.SiebelApp.S_App.GetActiveView()
    const pm = view.GetApplet('Account List Applet')?.GetPModel()
    expect(pm).toBe(siebel.getPM('Account List Applet'))
  })
})

describe('PM surface', () => {
  it('seeds the record set and applet identity', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const pm = siebel.getPM('Account List Applet')
    expect(pm.Get('GetName')).toBe('Account List Applet')
    expect(pm.Get('GetRecordSet')).toEqual(accountListFixture.records)
    expect(pm.Get('GetNumRows')).toBe(3)
  })

  it('distinguishes list vs form via GetListOfColumns (the bridge test)', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const list = siebel.getPM('Account List Applet')
    const form = siebel.getPM('Contact Form Applet')
    expect(typeof list.Get('GetListOfColumns') !== 'undefined').toBe(true)
    expect(typeof form.Get('GetListOfColumns') !== 'undefined').toBe(false)
  })

  it('exposes required columns for the list applet required-array build', () => {
    siebel = createMockSiebel({ applets: [accountListFixture] })
    const pm = siebel.getPM('Account List Applet')
    const columns = pm.Get('ListOfColumns') as Record<string, { isRequired: boolean }>
    expect(columns.Name?.isRequired).toBe(true)
    expect(columns.Location?.isRequired).toBe(false)
  })

  it('throws for an unregistered applet', () => {
    siebel = createMockSiebel({ applets: allApplets })
    expect(() => siebel!.getPM('Nope Applet')).toThrow('Mock applet not registered: Nope Applet')
  })

  it('ExecuteMethod can be overridden per applet, else falls back to defaults', () => {
    siebel = createMockSiebel({
      applets: [
        { ...accountListFixture, executeMethod: (name: string) => (name === 'CanUpdate' ? false : undefined) },
      ],
    })
    const pm = siebel.getPM('Account List Applet')
    expect(pm.ExecuteMethod('CanUpdate', 'Name')).toBe(false) // overridden
    expect(pm.ExecuteMethod('GetFieldDataType', 'Name')).toBe('text') // default
  })
})

describe('notification emit helpers', () => {
  it('emit fires every handler attached for a type, with the property set', () => {
    siebel = createMockSiebel({ applets: [contactFormFixture] })
    const pm = siebel.getPM('Contact Form Applet')
    const handler = vi.fn()
    pm.AttachNotificationHandler('SWE_PROP_BC_NOTI_STATE_CHANGED', handler)

    pm.emit({ type: 'SWE_PROP_BC_NOTI_STATE_CHANGED', props: { state: 'cp' } })
    expect(handler).toHaveBeenCalledOnce()
    const propSet = handler.mock.calls[0]?.[0]
    expect(propSet.GetProperty('state')).toBe('cp')
  })

  it('emitBatch wraps notifications in BEGIN ... END', () => {
    siebel = createMockSiebel({ applets: [accountListFixture] })
    const pm = siebel.getPM('Account List Applet')
    const seen: string[] = []
    for (const type of ['SWE_PROP_BC_NOTI_BEGIN', 'SWE_PROP_BC_NOTI_NEW_RECORD', 'SWE_PROP_BC_NOTI_END']) {
      pm.AttachNotificationHandler(type, () => seen.push(type))
    }
    pm.emitBatch([{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
    expect(seen).toEqual([
      'SWE_PROP_BC_NOTI_BEGIN',
      'SWE_PROP_BC_NOTI_NEW_RECORD',
      'SWE_PROP_BC_NOTI_END',
    ])
  })
})

// DoD: a trivial BaseApplet-style stub constructs against the mock and its subscriber fires on a batch.
// This mirrors how NexusNotifications wires BEGIN/accept/END, proving the surface tests will need.
class TinyApplet {
  readonly appletName: string
  readonly isList: boolean
  private readonly subscribers: Array<() => void> = []
  private accepted = 0

  constructor(pm: SiebelPresentationModel, consts: SiebelConstants) {
    this.appletName = pm.Get('GetName') as string
    this.isList = typeof pm.Get('GetListOfColumns') !== 'undefined'
    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_BEGIN'), () => {
      this.accepted = 0
    })
    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_NEW_RECORD'), () => {
      this.accepted += 1
    })
    pm.AttachNotificationHandler(consts.get('SWE_PROP_BC_NOTI_END'), () => {
      if (this.accepted > 0) this.subscribers.forEach((fn) => fn())
    })
  }

  subscribe(fn: () => void): void {
    this.subscribers.push(fn)
  }
}

describe('DoD: trivial applet constructs and subscribes against the mock', () => {
  it('constructs, reads identity, and fires subscribers on an accepted batch', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const applet = new TinyApplet(siebel.getPM('Account List Applet'), siebel.constants)
    expect(applet.appletName).toBe('Account List Applet')
    expect(applet.isList).toBe(true)

    const sub = vi.fn()
    applet.subscribe(sub)
    siebel.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
    expect(sub).toHaveBeenCalledOnce()
  })

  it('does not fire subscribers for an empty batch (nothing accepted)', () => {
    siebel = createMockSiebel({ applets: allApplets })
    const applet = new TinyApplet(siebel.getPM('Contact Form Applet'), siebel.constants)
    expect(applet.isList).toBe(false)

    const sub = vi.fn()
    applet.subscribe(sub)
    siebel.emitBatch('Contact Form Applet', [])
    expect(sub).not.toHaveBeenCalled()
  })

  it('makePropertySet builds a usable property set', () => {
    const ps = makePropertySet({ field: 'Name', state: 'n' }, 'SWE_PROP')
    expect(ps.GetProperty('field')).toBe('Name')
    expect(ps.GetType()).toBe('SWE_PROP')
    expect(ps.GetProperty('missing')).toBe('')
  })
})
