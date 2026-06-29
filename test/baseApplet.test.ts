// Behavioural-parity tests for the ported `BaseApplet` (Phase 06). Each block exercises a method group
// against the mock Siebel harness: record sets, control metadata, navigation guards, current-record
// state, sort, pagination, and the value-conversion round-trips. The assertions encode the legacy
// behaviour the port must preserve, not the implementation.
import { describe, it, expect, afterEach } from 'vitest'
import { BaseApplet, PositionError, ConnectError, QueryModeError } from 'siebel-connect'
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

/** Construction flags forwarded to the BaseApplet (drive the value-conversion paths). */
type AppletFlags = {
  convertDates?: boolean
  returnRawNumbers?: boolean
  returnRawIntegers?: boolean
  returnRawCurrencies?: boolean
}

/** Build a BaseApplet over a freshly-installed mock for the given applets. */
function makeApplet(def: MockAppletDef, others: MockAppletDef[] = [], flags: AppletFlags = {}) {
  siebel = createMockSiebel({ applets: [def, ...others] })
  const pm = siebel.getPM(def.name)
  const applet = new BaseApplet({ pm, ...flags })
  return { siebel: siebel!, pm, applet }
}

describe('BaseApplet: record sets', () => {
  it('getRecordSet returns cloned records with Id preserved', () => {
    const { applet } = makeApplet(accountListFixture)
    const rows = applet.getRecordSet()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ Id: '1-A', Name: 'Acme', Location: 'NY' })
    // clone, not the same reference as the PM's backing record
    expect(rows[0]).not.toBe(accountListFixture.records![0])
  })

  it('getRecordSet adds _indx only when addRecordIndex is set', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.getRecordSet()[1]).not.toHaveProperty('_indx')
    expect(applet.getRecordSet(true)[1]).toMatchObject({ _indx: 1 })
  })

  it('getRawRecordSet returns the raw rows', () => {
    const { applet } = makeApplet(accountListFixture)
    const raw = applet.getRawRecordSet(true)
    expect(raw.map((r) => r.Id)).toEqual(['1-A', '1-B', '1-C'])
    expect(raw[2]).toMatchObject({ _indx: 2 })
  })

  it('getControlsRecordSet projects Id + mapped control fields', () => {
    const { applet } = makeApplet(accountListFixture)
    const rows = applet.getControlsRecordSet()
    expect(rows[0]).toEqual({ Id: '1-A', Name: 'Acme', Location: 'NY' })
  })

  it('getControlsRecordsObject keys the projection by Id', () => {
    const { applet } = makeApplet(accountListFixture)
    const obj = applet.getControlsRecordsObject()
    expect(Object.keys(obj)).toEqual(['1-A', '1-B', '1-C'])
    expect(obj['1-B']).toMatchObject({ Name: 'Globex' })
  })
})

describe('BaseApplet: controls', () => {
  const skipFixture: MockAppletDef = {
    name: 'Skip Applet',
    isList: true,
    controls: {
      Name: { name: 'Name', uiType: 'Text', fieldName: 'Name', isRequired: true },
      Ghost: { name: 'Ghost', uiType: 'null', fieldName: 'Ghost' },
    },
    records: [{ Id: '1', Name: 'A', Ghost: 'x' }],
  }

  it('getControls skips controls whose uiType is "null" and synthesizes Id', () => {
    const { applet } = makeApplet(skipFixture)
    const controls = applet.getControls()
    expect(controls.Ghost).toBeUndefined()
    expect(controls.Name).toBeDefined()
    expect(controls.Id).toMatchObject({ name: 'Id', dataType: 'id' })
  })

  it('getControls marks list-column required controls', () => {
    const { applet } = makeApplet(skipFixture)
    // `Name` is isRequired in the list columns; its input name lands in the required[] array.
    expect(applet.getControls().Name!.required).toBe(true)
  })

  it('getListColumns throws ConnectError on a form applet', () => {
    const { applet } = makeApplet(contactFormFixture)
    expect(() => applet.getListColumns()).toThrow(ConnectError)
    expect(() => applet.getListColumns()).toThrow('[NB] getListColumns works only for list applet')
  })
})

describe('BaseApplet: positionOnRow guards', () => {
  it('throws PositionError on a form applet', () => {
    const { applet } = makeApplet(contactFormFixture)
    expect(() => applet.positionOnRow(0)).toThrow(PositionError)
    expect(() => applet.positionOnRow(0)).toThrow(
      '[NB] Method PositionOnRow is allowed only for list applets'
    )
  })

  it('throws on a non-integer index', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(() => applet.positionOnRow(1.5)).toThrow(
      '[NB] The index for positionOnRow should be integer number, given value - 1.5'
    )
  })

  it('throws on a negative index', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(() => applet.positionOnRow(-1)).toThrow(
      '[NB] Incorrect index given for positionOnRow - -1'
    )
  })

  it('throws when index exceeds the row-list row count', () => {
    const { applet } = makeApplet(accountListFixture)
    // rowListRowCount = 10, so index 10 needs 11 rows of capacity.
    expect(() => applet.positionOnRow(10)).toThrow('equal/higher than allowed amount of records')
  })

  it('throws when index exceeds the displayed row count', () => {
    const { applet } = makeApplet(accountListFixture)
    // numRows = 3, so index 5 is within capacity (10) but past the displayed rows.
    expect(() => applet.positionOnRow(5)).toThrow('equal/higher than displayed amount of records')
  })

  it('positions on a valid row and returns the result', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    const ret = applet.positionOnRow(2)
    expect(ret).toBe(true)
    expect(pm.Get('GetSelection')).toBe(2)
  })

  it('skips the server call when already positioned and skipIfAlreadyPositioned is set', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('GetSelection', 1)
    expect(applet.positionOnRow(1, undefined, true)).toBe(true)
  })
})

describe('BaseApplet: calculateCurrentRecordState', () => {
  function withBusComp(insertPending: boolean, commitPending: boolean): SiebelBusComp {
    return {
      GetName: () => 'BC',
      IsInsertPending: () => insertPending,
      IsCommitPending: () => commitPending,
    }
  }

  it('returns 3 in query mode', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('IsInQueryMode', true)
    expect(applet.calculateCurrentRecordState()).toBe(3)
  })

  it('returns 0 when nothing is selected', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('GetSelection', -1)
    expect(applet.calculateCurrentRecordState()).toBe(0)
  })

  it('returns 1 when an insert is pending', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('GetBusComp', withBusComp(true, false))
    expect(applet.calculateCurrentRecordState()).toBe(1)
  })

  it('returns 2 when a commit is pending', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('GetBusComp', withBusComp(false, true))
    expect(applet.calculateCurrentRecordState()).toBe(2)
  })

  it('returns 5 when WriteRecord cannot be invoked', () => {
    siebel = createMockSiebel({
      applets: [
        {
          ...accountListFixture,
          executeMethod: (name) => (name === 'CanInvokeMethod' ? false : undefined),
        },
      ],
    })
    const applet = new BaseApplet({ pm: siebel.getPM('Account List Applet') })
    expect(applet.calculateCurrentRecordState()).toBe(5)
  })

  it('returns 4 as the default for a displayed editable record', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.calculateCurrentRecordState()).toBe(4)
  })
})

describe('BaseApplet: sort and pagination', () => {
  it('sort returns true on a list applet', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.sort('Name', true)).toBe(true)
  })

  it('sort returns false on a form applet', () => {
    const { applet } = makeApplet(contactFormFixture)
    expect(applet.sort('FirstName', true)).toBe(false)
  })

  it('getPaginationInfo reflects the PM row-window state', () => {
    siebel = createMockSiebel({
      applets: [{ ...accountListFixture, wsStartRowNum: 1, wsEndRowNum: 3, numRowsKnown: true }],
    })
    const applet = new BaseApplet({ pm: siebel.getPM('Account List Applet') })
    expect(applet.getPaginationInfo()).toEqual({
      start: 1,
      end: 3,
      total: 3,
      hasMore: false,
      current: 1, // getSelection() (0) + start (1)
    })
  })
})

describe('BaseApplet: value conversion round-trips', () => {
  it('checkbox: boolean -> Y/N (Siebel) and back', () => {
    const { applet } = makeApplet(accountListFixture)
    const CHECKBOX = 'SWE_CTRL_CHECKBOX' // identity-mapped by the mock consts
    expect(applet._getSiebelValue(true, CHECKBOX)).toBe('Y')
    expect(applet._getSiebelValue(false, CHECKBOX)).toBe('N')
    expect(applet._getJSValue('Y', { uiType: CHECKBOX, dataType: 'text', displayFormat: '' })).toBe(
      true
    )
    expect(applet._getJSValue('N', { uiType: CHECKBOX, dataType: 'text', displayFormat: '' })).toBe(
      false
    )
  })

  it('non-checkbox values coerce to string on the way to Siebel', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet._getSiebelValue(42, 'Text')).toBe('42')
  })
})

describe('BaseApplet: date/number/currency conversion', () => {
  // Identity-mapped by the mock consts; SWE_CTRL_DATE_PICK is a date-time control.
  const DATE = 'SWE_CTRL_DATE_PICK'

  it('convertDates: a non-Date value for a date control throws ConnectError', () => {
    const { applet } = makeApplet(contactFormFixture, [], { convertDates: true })
    expect(() => applet._getSiebelValue('not-a-date', DATE, 'M/D/YYYY')).toThrow(ConnectError)
    expect(() => applet._getSiebelValue('not-a-date', DATE, 'M/D/YYYY')).toThrow(
      'value is expected to be a date'
    )
  })

  it('convertDates: an empty string from a date control reads back as null', () => {
    const { applet } = makeApplet(contactFormFixture, [], { convertDates: true })
    expect(applet._getJSValue('', { uiType: DATE, dataType: 'text', displayFormat: 'M/D/YYYY' })).toBeNull()
  })

  it('returnRawNumbers: routes a number through FormattedToString (group separators stripped)', () => {
    const { applet } = makeApplet(accountListFixture, [], { returnRawNumbers: true })
    expect(applet._getJSValue('1,234', { uiType: 'Text', dataType: 'number', displayFormat: '' })).toBe(
      '1234'
    )
  })

  it('returnRawCurrencies: applies the currency code then FormattedToString', () => {
    const { applet } = makeApplet(accountListFixture, [], { returnRawCurrencies: true })
    expect(
      applet._getJSValue('1,000', {
        uiType: 'Text',
        dataType: 'currency',
        displayFormat: '',
        currencyCode: 'USD',
      })
    ).toBe('1000')
  })
})

describe('BaseApplet: query family', () => {
  it('queryBySearchExprSync runs a query and returns the record count', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    expect(applet.queryBySearchExprSync('Name="Acme"')).toBe(3)
    expect(pm.Get('IsInQueryMode')).toBe(false) // ExecuteQuery exits query mode
  })

  it('queryByIdSync accepts a single id and an array of ids', () => {
    const { applet } = makeApplet(accountListFixture)
    expect(applet.queryByIdSync('1-A')).toBe(3)
    expect(applet.queryByIdSync(['1-A', '1-B'])).toBe(3)
  })

  it('query (async) resolves with the record count', async () => {
    const { applet } = makeApplet(accountListFixture)
    await expect(applet.query({ Name: 'Acme' })).resolves.toBe(3)
  })

  it('queryById (async) resolves with the record count', async () => {
    const { applet } = makeApplet(accountListFixture)
    await expect(applet.queryById('1-A')).resolves.toBe(3)
  })

  it('_newQuery short-circuits to false when already in query mode and checkQueryMode is set', () => {
    const { applet, pm } = makeApplet(accountListFixture)
    pm.set('IsInQueryMode', true)
    expect(applet._newQuery(true)).toBe(false)
  })

  it('_newQuery throws QueryModeError when the applet fails to enter query mode', () => {
    siebel = createMockSiebel({
      applets: [
        {
          ...accountListFixture,
          // NewQuery is acknowledged but does not flip the PM into query mode.
          executeMethod: (name, args) =>
            name === 'InvokeMethod' && args[0] === 'NewQuery' ? true : undefined,
        },
      ],
    })
    const applet = new BaseApplet({ pm: siebel.getPM('Account List Applet') })
    expect(() => applet._newQuery()).toThrow(QueryModeError)
  })
})

describe('BaseApplet: getMVF', () => {
  it('resolves the ResultSet tree with SSA Primary Field converted to boolean', async () => {
    // Mock the "Nexus BS" business service: build the nested ResultSet the bridge walks
    // (field -> requested-field-group -> records) and fire the async callback.
    const nexusBs: SiebelService = {
      InvokeMethod(method, inputs, opts) {
        const ai = opts as { cb: (m: string, i: SiebelPropertySet, o: SiebelPropertySet) => void }
        const record = makePropertySet({ Id: '2-A', 'SSA Primary Field': 'Y' })
        const fieldGroup = makePropertySet({}, 'Account')
        fieldGroup.AddChild(record)
        const field = makePropertySet({}, 'First Name')
        field.AddChild(fieldGroup)
        const resultSet = makePropertySet({}, 'ResultSet')
        resultSet.AddChild(field)
        const outputs = new MockPropertySet()
        outputs.AddChild(resultSet)
        ai.cb(method, inputs, outputs)
        return true
      },
    }
    siebel = createMockSiebel({ applets: [contactFormFixture], services: { 'Nexus BS': nexusBs } })
    const applet = new BaseApplet({ pm: siebel.getPM('Contact Form Applet') })

    const mvf = await applet.getMVF(['2-A'], { FirstName: ['Account'] }, false)
    expect(mvf).toEqual({ 'First Name': { Account: [{ Id: '2-A', 'SSA Primary Field': true }] } })
  })
})

describe('BaseApplet: getCurrentRecordModel', () => {
  it('assembles state, id, controls and methods for a displayed record', () => {
    const { applet } = makeApplet(contactFormFixture)
    const model = applet.getCurrentRecordModel()
    expect(model.controls.state).toBe(4)
    expect(model.controls.id).toBe('2-A')
    expect(model.controls.Id).toMatchObject({ value: '2-A' })
    expect(model.controls.FirstName).toMatchObject({ name: 'FirstName', readonly: false })
    expect(model.methods).toEqual({})
  })

  it('keeps controls editable and clears the Id value in query mode (state 3)', () => {
    const { applet, pm } = makeApplet(contactFormFixture)
    pm.set('IsInQueryMode', true)
    const model = applet.getCurrentRecordModel()
    expect(model.controls.state).toBe(3)
    expect(model.controls.FirstName).toMatchObject({ readonly: false })
    expect(model.controls.Id).toMatchObject({ value: '' })
  })
})
