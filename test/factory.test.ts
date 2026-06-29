// Behavioural-parity tests for the typed factory (Phase 09, was `nexus-factory`). They assert the
// preserved runtime semantics: per-key memoization (built once at `init`, same instance thereafter),
// destructive object-init (a second `init` drops the prior memo), popup detection (`IsPopup` PM flag
// builds a `PopupApplet`), and the clean-break throw on unknown keys. The `[NF]` log strings are
// checked through a captured debug logger to prove the diagnostics still fire verbatim.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  init,
  getApplet,
  getPopup,
  clear,
  configure,
  Applet,
  PopupApplet,
  PopupController,
  AppletNotFoundError,
} from 'siebel-connect'
import { createMockSiebel, type MockAppletDef } from 'siebel-connect/testing'
import { accountListFixture, contactFormFixture, type Account, type Contact } from './fixtures/applets'

// Disjoint keys (not `accountList`) so this file's augmentation can't collide with the type-level
// suite's. A popup key is registered for the `getPopup` path.
type ContactMvg = Contact
declare module 'siebel-connect' {
  interface AppletRegistry {
    acctList: Account
    acctForm: Account
    contactsMvg: ContactMvg
  }
}

const popupFixture: MockAppletDef = {
  name: 'Contacts MVG Applet',
  isList: true,
  controls: { Last: { name: 'Last', uiType: 'Text', fieldName: 'Last Name' } },
  records: [{ Id: '9-A', 'First Name': 'Grace', 'Last Name': 'Hopper' }],
}

let siebel: ReturnType<typeof createMockSiebel> | undefined
const logs: string[] = []
configure({ debug: true, logger: { log: (m) => logs.push(String(m)), warn() {}, error() {} } })

beforeEach(() => {
  logs.length = 0
})

afterEach(() => {
  // The factory memo and the PopupController singleton are module state; reset both between tests.
  clear(getRegisteredKeys())
  PopupController.resetInstanceForTesting()
  siebel?.destroy()
  siebel = undefined
})

// `clear` throws on a missing key, so only pass the keys actually memoized in the current test.
let registered: Array<'acctList' | 'acctForm' | 'contactsMvg'> = []
function getRegisteredKeys() {
  const keys = registered
  registered = []
  return keys
}

function setup(applets: MockAppletDef[] = [accountListFixture, contactFormFixture, popupFixture]) {
  siebel = createMockSiebel({ applets })
  return siebel
}

describe('init + getApplet: memoization', () => {
  it('builds each applet once at init and returns the same instance thereafter', () => {
    const s = setup()
    init({ acctList: accountListFixture.name, acctForm: contactFormFixture.name })
    registered = ['acctList', 'acctForm']

    const first = getApplet('acctList')
    const second = getApplet('acctList')
    expect(first).toBeInstanceOf(Applet)
    expect(second).toBe(first) // memoized: identical reference
    // Exactly one "created" log per key, none built twice.
    expect(logs.filter((l) => l.startsWith('[NF] Nexus instance created:'))).toEqual([
      `[NF] Nexus instance created: acctList - ${accountListFixture.name}`,
      `[NF] Nexus instance created: acctForm - ${contactFormFixture.name}`,
    ])
    expect(s.getPM(accountListFixture.name)).toBeDefined()
  })
})

describe('init: destructive rebuild', () => {
  it('drops the entire prior memo before rebuilding', () => {
    setup()
    init({ acctList: accountListFixture.name })
    const before = getApplet('acctList')
    registered = ['acctList']

    // Second object-init with a different key wipes the memo first (legacy semantics).
    init({ acctForm: contactFormFixture.name })
    registered = ['acctForm']

    expect(logs).toContain('[NF] Nexus instance deleted: Account List Applet')
    expect(() => getApplet('acctList')).toThrow(AppletNotFoundError)
    expect(getApplet('acctForm')).toBeInstanceOf(Applet)
    // The rebuilt acctForm is a fresh instance, not the wiped acctList one.
    expect(getApplet('acctForm')).not.toBe(before)
  })
})

describe('popup detection', () => {
  it('builds a PopupApplet for a key whose PM reports IsPopup', () => {
    const s = setup()
    s.getPM(popupFixture.name).set('IsPopup', true)
    init({ contactsMvg: popupFixture.name })
    registered = ['contactsMvg']

    expect(getPopup('contactsMvg')).toBeInstanceOf(PopupApplet)
  })

  it('builds a plain Applet when IsPopup is absent', () => {
    setup()
    init({ acctList: accountListFixture.name })
    registered = ['acctList']

    const applet = getApplet('acctList')
    expect(applet).toBeInstanceOf(Applet)
    expect(applet).not.toBeInstanceOf(PopupApplet)
  })
})

describe('clean break: unknown keys throw', () => {
  it('getApplet throws AppletNotFoundError for an uninitialised key', () => {
    setup()
    expect(() => getApplet('acctList')).toThrow(AppletNotFoundError)
    expect(() => getApplet('acctList')).toThrow("[NF] 'acctList' is not found among NB instances")
  })

  it('init throws AppletNotFoundError when the Siebel applet name is unknown', () => {
    setup()
    expect(() => init({ acctList: 'No Such Applet' })).toThrow(AppletNotFoundError)
    expect(() => init({ acctList: 'No Such Applet' })).toThrow('[NF] Applet not found: No Such Applet')
  })

  it('clear throws AppletNotFoundError for a key not among the memoized instances', () => {
    setup()
    expect(() => clear(['acctList'])).toThrow(AppletNotFoundError)
    expect(() => clear(['acctList'])).toThrow("[NF] 'acctList' is not found among NB instances")
  })
})
