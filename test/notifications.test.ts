import { describe, it, expect, vi, afterEach } from 'vitest'
import { Notifications } from 'siebel-connect'
import { createMockSiebel } from 'siebel-connect/testing'
import { accountListFixture } from './fixtures/applets'

let siebel: ReturnType<typeof createMockSiebel> | undefined
afterEach(() => {
  siebel?.destroy()
  siebel = undefined
})

function makeNotifications(
  opts: { fieldToControlMap?: Record<string, { uiType: string }>; debug?: boolean } = {}
) {
  siebel = createMockSiebel({ applets: [accountListFixture] })
  const pm = siebel.getPM('Account List Applet')
  const notif = new Notifications({
    pm,
    consts: siebel.constants,
    fieldToControlMap: opts.fieldToControlMap ?? {},
    ...(opts.debug !== undefined ? { debug: opts.debug } : {}),
  })
  return { siebel, pm, notif }
}

describe('Notifications: subscribe / unsubscribe token semantics', () => {
  it('increments the token for anonymous subscribers', () => {
    const { notif } = makeNotifications()
    const t1 = notif.subscribe(() => {})
    const t2 = notif.subscribe(() => {})
    expect(t1).toBe(1)
    expect(t2).toBe(2)
    expect(notif.subscribers).toHaveLength(2)
  })

  it('keys named subscribers by name and replaces a prior same-name subscription', () => {
    const { notif } = makeNotifications()
    function handler() {}
    const first = notif.subscribe(handler)
    expect(first).toBe('handler')
    expect(notif.subscribers).toHaveLength(1)

    notif.subscribe(handler) // same name replaces, no growth
    expect(notif.subscribers).toHaveLength(1)
  })

  it('unsubscribes by token and reports the removed index', () => {
    const { notif } = makeNotifications()
    const t1 = notif.subscribe(() => {})
    notif.subscribe(() => {})
    const removed = notif.unsubscribe(t1)
    expect(removed).toBe(0)
    expect(notif.subscribers).toHaveLength(1)
    expect(notif.unsubscribe(t1)).toBe(-1) // already gone
  })

  it('throws when handed a non-function', () => {
    const { notif } = makeNotifications()
    // @ts-expect-error deliberately wrong type to exercise the runtime guard
    expect(() => notif.subscribe('nope')).toThrow('[NB] func is not a function')
  })
})

describe('Notifications: accepted vs skipped batches', () => {
  it('invokes subscribers once on a batch with an accepted notification', () => {
    const { notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
    expect(sub).toHaveBeenCalledOnce()
  })

  it('does not invoke subscribers on a batch with only a skipped notification', () => {
    const { notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    // STATE_CHANGED with state 'n' is in the skip list.
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_STATE_CHANGED', props: { state: 'n' } },
    ])
    expect(sub).not.toHaveBeenCalled()
    expect(notif.skippedNotifications).toHaveLength(1)
  })

  it('resets accepted/skipped on each BEGIN so empty batches do not leak prior state', () => {
    const { notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
    siebel!.emitBatch('Account List Applet', []) // BEGIN -> END, nothing accepted
    expect(sub).toHaveBeenCalledOnce() // only the first batch fired it
  })
})

describe('Notifications: cp-state MVG/PICK skip', () => {
  it('skips a cp STATE_CHANGED while an MVG control is active', () => {
    const { pm, notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    const mvgControl = { GetUIType: () => 'SWE_CTRL_MVG' } as unknown as SiebelControl
    pm.setActiveControl(mvgControl)
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_STATE_CHANGED', props: { state: 'cp' } },
    ])
    expect(sub).not.toHaveBeenCalled()
    expect(notif.skippedNotifications).toHaveLength(1)
  })

  it('accepts a cp STATE_CHANGED when no MVG/PICK control is active', () => {
    const { pm, notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    pm.setActiveControl(null)
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_STATE_CHANGED', props: { state: 'cp' } },
    ])
    expect(sub).toHaveBeenCalledOnce()
  })
})

describe('Notifications: per-type accept handlers', () => {
  it('accepts NEW_ACTIVE_ROW and DELETE_RECORD unconditionally', () => {
    const { notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_ACTIVE_ROW' }])
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_DELETE_RECORD' }])
    expect(sub).toHaveBeenCalledTimes(2)
  })

  it('accepts NEW_DATA_WS only when its field maps to a non-MVG control', () => {
    const { notif } = makeNotifications({ fieldToControlMap: { Name: { uiType: 'SWE_CTRL_TEXT' } } })
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_NEW_DATA_WS', props: { SWE_PROP_NOTI_FIELD: 'Name' } },
    ])
    expect(sub).toHaveBeenCalledOnce()
  })

  it('skips NEW_DATA_WS when its field maps to an MVG control', () => {
    const { notif } = makeNotifications({ fieldToControlMap: { Name: { uiType: 'SWE_CTRL_MVG' } } })
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_NEW_DATA_WS', props: { SWE_PROP_NOTI_FIELD: 'Name' } },
    ])
    expect(sub).not.toHaveBeenCalled()
    expect(notif.skippedNotifications).toHaveLength(1)
  })

  it('skips NEW_DATA_WS when the field maps to no control', () => {
    const { notif } = makeNotifications()
    const sub = vi.fn()
    notif.subscribe(sub)
    siebel!.emitBatch('Account List Applet', [
      { type: 'SWE_PROP_BC_NOTI_NEW_DATA_WS', props: { SWE_PROP_NOTI_FIELD: 'Unmapped' } },
    ])
    expect(sub).not.toHaveBeenCalled()
  })
})

describe('Notifications: debug passthrough handlers', () => {
  it('captures the noisy diagnostic notifications into skippedNotifications when debug is on', () => {
    const { notif } = makeNotifications({ debug: true })
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_GENERIC' }])
    expect(notif.skippedNotifications.map((n) => n.type)).toContain('SWE_PROP_BC_NOTI_GENERIC')
  })

  it('does not attach the diagnostic handlers when debug is off', () => {
    const { notif } = makeNotifications({ debug: false })
    siebel!.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_GENERIC' }])
    expect(notif.skippedNotifications).toHaveLength(0)
  })
})
