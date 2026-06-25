// In-memory Siebel harness for "siebel-connect/testing".
//
// `createMockSiebel({ applets })` installs a minimal `window.SiebelApp` / `SiebelJS` /
// `SiebelAppFacade` so the ported bridge runs with no live Siebel server. It powers every later
// phase's tests and offline dev.
//
// Fidelity rule (Phase 04 spec): the mock mirrors the real Open UI API *names and return shapes*. The
// surface here is modelled from how the legacy `nexus-bridge` actually calls the PM (constructor
// reads, `Get`/`ExecuteMethod` keys, notification-handler wiring), not from guesses. It implements the
// ambient `Siebel*` interfaces from `core/siebel-globals.d.ts`, so a drift between mock and the typed
// boundary is a compile error. The harness is deliberately small; it grows as each port phase needs
// new PM calls.

import type { SiebelRecord } from '../core/types'

// ----------------------------------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------------------------------

// The notification + control keys the bridge looks up via `consts.get(...)`. Real Siebel maps each to
// an opaque code; the bridge only relies on the value being stable and consistent between the attach
// side and the dispatch side, so the mock identity-maps (key -> key). Listed explicitly (rather than a
// blind passthrough) so the harness documents exactly which constants the bridge depends on.
export const KNOWN_CONSTANTS = [
  'SWE_PROP_BC_NOTI_BEGIN',
  'SWE_PROP_BC_NOTI_END',
  'SWE_PROP_BC_NOTI_NEW_ACTIVE_ROW',
  'SWE_PROP_BC_NOTI_STATE_CHANGED',
  'SWE_PROP_BC_NOTI_NEW_DATA_WS',
  'SWE_PROP_BC_NOTI_DELETE_RECORD',
  'SWE_PROP_BC_NOTI_NEW_RECORD',
  'SWE_PROP_NOTI_FIELD',
  'SWE_CTRL_MVG',
  'SWE_CTRL_PICK',
  'SWE_CTRL_COMBOBOX',
  'SWE_CTRL_TEXT',
] as const

class MockConstants implements SiebelConstants {
  /** Identity map: a faithful stand-in for Siebel's opaque code lookup. Unknown keys echo back too. */
  get(key: string): string {
    return key
  }
}

// ----------------------------------------------------------------------------------------------------
// Property set
// ----------------------------------------------------------------------------------------------------

/** Faithful in-memory `SiebelPropertySet`: flat string props plus a typed child tree. */
export class MockPropertySet implements SiebelPropertySet {
  propArray: Record<string, string> = {}
  childArray: SiebelPropertySet[] = []
  private type = ''

  SetProperty(key: string, value: unknown): void {
    this.propArray[key] = String(value)
  }
  GetProperty(key: string): string {
    return this.propArray[key] ?? ''
  }
  SetType(type: string): void {
    this.type = type
  }
  GetType(): string {
    return this.type
  }
  AddChild(child: SiebelPropertySet): void {
    this.childArray.push(child)
  }
  Clone(): SiebelPropertySet {
    const copy = new MockPropertySet()
    copy.propArray = { ...this.propArray }
    copy.type = this.type
    copy.childArray = this.childArray.map((c) => c.Clone())
    return copy
  }
  GetChildByType(type: string): SiebelPropertySet | undefined {
    return this.childArray.find((c) => c.GetType() === type)
  }
}

/** Build a property set from a plain object (handy for emit helpers). */
export function makePropertySet(props: Record<string, unknown> = {}, type = ''): MockPropertySet {
  const ps = new MockPropertySet()
  ps.SetType(type)
  for (const [k, v] of Object.entries(props)) ps.SetProperty(k, v)
  return ps
}

// ----------------------------------------------------------------------------------------------------
// Control
// ----------------------------------------------------------------------------------------------------

/** Config for one mock control; every field defaults so fixtures only set what they care about. */
export interface MockControlDef {
  name: string
  uiType?: string
  inputName?: string
  fieldName?: string
  displayName?: string
  displayFormat?: string
  maxSize?: number
  methodName?: string
  popupType?: string
  currField?: string
  /** Siebel returns `'1'` / `'0'` strings, not booleans. */
  staticBounded?: boolean
  boundedPick?: boolean
  postChanges?: boolean
  sortable?: boolean
  /** Used by the list-applet required-controls array. */
  isRequired?: boolean
}

class MockControl implements SiebelControl {
  constructor(private readonly def: MockControlDef) {}
  GetName(): string {
    return this.def.name
  }
  GetUIType(): string {
    return this.def.uiType ?? 'Text'
  }
  GetInputName(): string {
    return this.def.inputName ?? `s_${this.def.name}`
  }
  GetFieldName(): string {
    return this.def.fieldName ?? this.def.name
  }
  GetDisplayName(): string {
    return this.def.displayName ?? this.def.name
  }
  GetDisplayFormat(): string {
    return this.def.displayFormat ?? ''
  }
  GetMaxSize(): number {
    return this.def.maxSize ?? 100
  }
  GetMethodName(): string {
    return this.def.methodName ?? ''
  }
  GetPopupType(): string {
    return this.def.popupType ?? ''
  }
  GetCurrField(): string {
    return this.def.currField ?? ''
  }
  IsStaticBounded(): string {
    return this.def.staticBounded ? '1' : '0'
  }
  IsBoundedPick(): string {
    return this.def.boundedPick ? '1' : '0'
  }
  IsPostChanges(): boolean {
    return this.def.postChanges ?? false
  }
  IsSortable(): boolean {
    return this.def.sortable ?? false
  }
  GetIconMap(): unknown {
    return null
  }
  GetPMPropSet(): SiebelPropertySet {
    return new MockPropertySet()
  }
  GetRadioGroupPropSet(): SiebelPropertySet {
    return new MockPropertySet()
  }
  GetMethodPropSet(): SiebelPropertySet {
    return new MockPropertySet()
  }
}

// ----------------------------------------------------------------------------------------------------
// Presentation Model
// ----------------------------------------------------------------------------------------------------

/** A notification fired through the mock PM: a constant type plus its property set. */
export interface MockNotification {
  /** Bare constant name, e.g. `'SWE_PROP_BC_NOTI_NEW_RECORD'` (matches `consts.get` identity map). */
  type: string
  /** Properties to expose on the handler's `propSet` (e.g. `{ state: 'cp' }`). */
  props?: Record<string, unknown>
}

/** One applet's seed data. Only `name` is required; the rest default to an empty list applet. */
export interface MockAppletDef {
  name: string
  isList?: boolean
  /** Controls keyed by control name. */
  controls?: Record<string, MockControlDef>
  /** Rows returned by `Get('GetRecordSet')`. */
  records?: SiebelRecord[]
  /** Rows returned by `Get('GetRawRecordSet')`; defaults to `records`. */
  rawRecords?: SiebelRecord[]
  rowListRowCount?: number
  numRows?: number
  selection?: number
  inQueryMode?: boolean
  fullId?: string
  /** `Get('GetWSEndRowNum')` — used by `getPaginationInfo`. Defaults to the record count. */
  wsEndRowNum?: number
  /** `ExecuteMethod('GetWSStartRowNum')` — used by `getPaginationInfo`. Defaults to `1`. */
  wsStartRowNum?: number
  /** `Get('IsNumRowsKnown')` — drives `getPaginationInfo.hasMore`. Defaults to `true`. */
  numRowsKnown?: boolean
  /** Seeds the mock BusComp's `IsInsertPending` (drives `calculateCurrentRecordState` → 1). */
  insertPending?: boolean
  /** Seeds the mock BusComp's `IsCommitPending` (drives `calculateCurrentRecordState` → 2). */
  commitPending?: boolean
  /**
   * Override / extend `ExecuteMethod`. Receives the method name and args; return a value to handle it,
   * or `undefined` to fall through to the built-in defaults.
   */
  executeMethod?: (name: string, args: unknown[]) => unknown
}

/** Args bag the bridge passes as the 4th `ExecuteMethod('InvokeMethod', name, null, ai)` argument. */
interface InvokeMethodArgs {
  async?: boolean
  cb?: (...args: unknown[]) => unknown
}

/** Minimal `SiebelBusComp` for `calculateCurrentRecordState` / `getMVF`. */
class MockBusComp implements SiebelBusComp {
  constructor(
    private readonly def: {
      name: string
      insertPending?: boolean | undefined
      commitPending?: boolean | undefined
    }
  ) {}
  GetName(): string {
    return this.def.name
  }
  IsInsertPending(): boolean {
    return this.def.insertPending ?? false
  }
  IsCommitPending(): boolean {
    return this.def.commitPending ?? false
  }
}

type NotificationHandler = (propSet: SiebelPropertySet) => void
type PMBinding = (...args: unknown[]) => void

/**
 * In-memory `SiebelPresentationModel`. `Get`/`ExecuteMethod` read a backing store seeded from the
 * applet def; tests can tweak it with {@link set} and drive notifications with {@link emit} /
 * {@link emitBatch}.
 */
export class MockPresentationModel implements SiebelPresentationModel {
  private readonly store = new Map<string, unknown>()
  private readonly controls: Record<string, MockControl> = {}
  private readonly notificationHandlers = new Map<string, NotificationHandler[]>()
  private readonly pmBindings = new Map<string, PMBinding>()
  private activeControl: SiebelControl | null = null

  constructor(private readonly def: MockAppletDef) {
    const records = def.records ?? []
    const controlDefs = def.controls ?? {}
    for (const [name, cd] of Object.entries(controlDefs)) {
      this.controls[name] = new MockControl({ ...cd, name })
    }

    const listColumns: Record<string, { control: MockControl; isRequired: boolean }> = {}
    for (const [name, control] of Object.entries(this.controls)) {
      listColumns[name] = { control, isRequired: controlDefs[name]?.isRequired ?? false }
    }

    this.store.set('GetName', def.name)
    this.store.set('GetFullId', def.fullId ?? `s_${def.name.replace(/\s+/g, '_')}`)
    // `typeof Get('GetListOfColumns') !== 'undefined'` is the bridge's list-vs-form test.
    this.store.set('GetListOfColumns', def.isList ? this.controls : undefined)
    this.store.set('ListOfColumns', listColumns)
    // The bridge reads `Get('GetControls')` for the full control map (even on list applets).
    this.store.set('GetControls', this.controls)
    this.store.set('GetRecordSet', records)
    this.store.set('GetRawRecordSet', def.rawRecords ?? records)
    this.store.set('IsInQueryMode', def.inQueryMode ?? false)
    this.store.set('GetRowListRowCount', def.rowListRowCount ?? 10)
    this.store.set('GetNumRows', def.numRows ?? records.length)
    this.store.set('GetSelection', def.selection ?? (records.length > 0 ? 0 : -1))
    this.store.set('GetWSEndRowNum', def.wsEndRowNum ?? records.length)
    this.store.set('GetWSStartRowNum', def.wsStartRowNum ?? 1)
    this.store.set('IsNumRowsKnown', def.numRowsKnown ?? true)
    this.store.set(
      'GetBusComp',
      new MockBusComp({
        name: `${def.name} BC`,
        insertPending: def.insertPending,
        commitPending: def.commitPending,
      })
    )
  }

  // --- the SiebelPresentationModel surface ---

  Get(name: string): unknown {
    if (name === 'GetActiveControl') return this.activeControl
    return this.store.get(name)
  }

  ExecuteMethod(name: string, ...args: unknown[]): unknown {
    const override = this.def.executeMethod?.(name, args)
    if (override !== undefined) return override
    switch (name) {
      case 'GetControl':
        return this.controls[args[0] as string]
      case 'SetActiveControl':
        this.activeControl = (args[0] as SiebelControl | null) ?? null
        return true
      case 'HandleRowSelect': {
        const idx = Number(args[0])
        this.store.set('GetSelection', idx)
        return true
      }
      case 'OnClickSort':
        return true
      case 'GetWSStartRowNum':
        return (this.store.get('GetWSStartRowNum') as number | undefined) ?? 1
      case 'InvokeMethod':
        return this.invokeBcMethod(args[0] as string, args[2] as InvokeMethodArgs | undefined)
      case 'GetFieldDataType':
        return 'text'
      case 'CanNavigate':
        return false
      case 'CanUpdate':
        return true
      case 'GetFormattedFieldValue':
        return ''
      case 'CanInvokeMethod':
        return true
      default:
        return undefined
    }
  }

  /**
   * Simulate `InvokeMethod` for the BC operations the bridge drives. Mirrors real Open UI semantics:
   * `NewQuery` enters query mode, `ExecuteQuery` exits it and fires the async callback, `WriteRecord`
   * calls back with a `Completed` status property set (what `writeRecord` inspects).
   */
  private invokeBcMethod(method: string, ai?: InvokeMethodArgs): unknown {
    switch (method) {
      case 'NewQuery':
        this.store.set('IsInQueryMode', true)
        return true
      case 'ExecuteQuery':
        this.store.set('IsInQueryMode', false)
        if (ai?.async && typeof ai.cb === 'function') ai.cb()
        return true
      case 'CreateRecord':
        if (ai?.async && typeof ai.cb === 'function') ai.cb()
        return true
      case 'WriteRecord':
        if (ai?.async && typeof ai.cb === 'function') {
          ai.cb('WriteRecord', null, makePropertySet({ Status: 'Completed' }))
        }
        return true
      default:
        // DeleteRecord, UndoRecord, GotoNext/GotoNextSet, …
        return true
    }
  }

  OnControlEvent(_event: string, ..._args: unknown[]): unknown {
    return undefined
  }

  SetProperty(key: string, value: unknown): unknown {
    this.store.set(key, value)
    return value
  }

  AddProperty(key: string, value: unknown): void {
    this.store.set(key, value)
  }

  AttachNotificationHandler(type: string, handler: NotificationHandler): void {
    const list = this.notificationHandlers.get(type) ?? []
    list.push(handler)
    this.notificationHandlers.set(type, list)
  }

  AttachPMBinding(name: string, handler: PMBinding, _options?: { scope?: unknown }): void {
    this.pmBindings.set(name, handler)
  }

  GetRenderer(): SiebelRenderer | undefined {
    return undefined
  }

  Setup(): void {}
  Init(): void {}
  EndLife(): void {}

  // --- test affordances (not part of the Siebel surface) ---

  /** Overwrite a backing `Get(...)` value, e.g. `set('IsInQueryMode', true)`. */
  set(key: string, value: unknown): void {
    this.store.set(key, value)
  }

  /** Set what `Get('GetActiveControl')` returns. */
  setActiveControl(control: SiebelControl | null): void {
    this.activeControl = control
  }

  /** Fire a registered PM binding (e.g. `'UpdateQuickPickInfo'`). */
  fireBinding(name: string, ...args: unknown[]): void {
    this.pmBindings.get(name)?.(...args)
  }

  /** Dispatch one notification to every handler attached for its type. */
  emit(notification: MockNotification): void {
    const handlers = this.notificationHandlers.get(notification.type)
    if (!handlers) return
    const propSet = makePropertySet(notification.props ?? {})
    for (const handler of handlers) handler(propSet)
  }

  /**
   * Simulate a real BC notification batch: `BEGIN` -> the given notifications -> `END`. This is the
   * exact sequence `NexusNotifications` listens for, so a subscriber attached through the bridge fires
   * once at `END` when at least one notification was accepted.
   */
  emitBatch(notifications: MockNotification[]): void {
    this.emit({ type: 'SWE_PROP_BC_NOTI_BEGIN' })
    for (const n of notifications) this.emit(n)
    this.emit({ type: 'SWE_PROP_BC_NOTI_END' })
  }
}

// ----------------------------------------------------------------------------------------------------
// Application singletons
// ----------------------------------------------------------------------------------------------------

class MockBoolObject implements SiebelBoolObject {
  private value = false
  SetValue(value: unknown): void {
    this.value = value === true || value === 'Y' || value === '1'
  }
  GetValue(): boolean {
    return this.value
  }
  GetAsString(): string {
    return this.value ? 'Y' : 'N'
  }
  SetAsString(value: string): void {
    this.value = value === 'Y'
  }
}

// ----------------------------------------------------------------------------------------------------
// createMockSiebel
// ----------------------------------------------------------------------------------------------------

/** Handle returned by {@link createMockSiebel}. Look up PMs, drive notifications, then `destroy()`. */
export interface MockSiebel {
  /** The shared `Constants` instance (identity-mapped). */
  constants: SiebelConstants
  /** The PM for an applet by name. Throws if the applet was not registered. */
  getPM(appletName: string): MockPresentationModel
  /** Emit a notification batch (`BEGIN -> ... -> END`) on one applet's PM. */
  emitBatch(appletName: string, notifications: MockNotification[]): void
  /** Remove the installed globals and restore whatever was there before. */
  destroy(): void
}

const WINDOW_KEYS = ['SiebelApp', 'SiebelJS', 'SiebelAppFacade'] as const

/**
 * Install an in-memory Siebel on `window`.
 *
 * ```ts
 * const siebel = createMockSiebel({ applets: [accountListFixture] })
 * const pm = siebel.getPM('Account List Applet')
 * siebel.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
 * siebel.destroy()
 * ```
 */
export function createMockSiebel(options: { applets: MockAppletDef[] }): MockSiebel {
  const constants = new MockConstants()
  const pms = new Map<string, MockPresentationModel>()
  const applets = new Map<string, SiebelApplet>()

  for (const def of options.applets) {
    const pm = new MockPresentationModel(def)
    pms.set(def.name, pm)
    applets.set(def.name, {
      GetName: () => def.name,
      GetPModel: () => pm,
    })
  }

  const view: SiebelView = {
    GetName: () => 'Mock Active View',
    GetApplet: (name) => applets.get(name),
  }

  // Members the harness does not model yet throw on use rather than being cast away. This keeps the
  // `S_App` object a real `SiebelSApp` (no `as unknown as`), so adding a member to the typed boundary
  // is a compile error here until the mock grows a stub for it (the fidelity rule in the file header).
  const notInMock =
    (method: string) =>
    (): never => {
      throw new Error(`SiebelApp.S_App.${method} is not modelled by the mock harness yet`)
    }

  const sApp: SiebelSApp = {
    GetActiveView: () => view,
    NewPropertySet: () => new MockPropertySet(),
    DatumBoolObject: MockBoolObject,
    LocaleObject: makeLocaleObject(),
    GetActiveBusObj: notInMock('GetActiveBusObj'),
    GetPopupPM: notInMock('GetPopupPM'),
    GetService: notInMock('GetService'),
    GetPageURL: notInMock('GetPageURL'),
    GetAppExtension: notInMock('GetAppExtension'),
    LookupStringCache: notInMock('LookupStringCache'),
    GetIconMap: notInMock('GetIconMap'),
    GotoView: notInMock('GotoView'),
    ProcessNewPopup: notInMock('ProcessNewPopup'),
  }

  const siebelApp: SiebelAppGlobal = {
    S_App: sApp,
    Constants: constants,
    EventManager: { addListner: () => {} },
    CommandManager: { GetInstance: notInMock('CommandManager.GetInstance') },
    Utils: { Confirm: () => true },
  }

  const siebelJS: SiebelJSGlobal = {
    Dependency: (path) => resolveDependency(path, { SiebelApp: siebelApp }),
  }

  const siebelAppFacade: SiebelAppFacadeGlobal = { ExplorerPresentationModel: {} }

  // Snapshot whatever is currently on window so destroy() can restore it exactly.
  const previous = new Map<string, unknown>()
  for (const key of WINDOW_KEYS) previous.set(key, Reflect.get(window, key))

  window.SiebelApp = siebelApp
  window.SiebelJS = siebelJS
  window.SiebelAppFacade = siebelAppFacade

  return {
    constants,
    getPM(appletName) {
      const pm = pms.get(appletName)
      if (!pm) throw new Error(`Mock applet not registered: ${appletName}`)
      return pm
    },
    emitBatch(appletName, notifications) {
      this.getPM(appletName).emitBatch(notifications)
    },
    destroy() {
      for (const key of WINDOW_KEYS) {
        const prior = previous.get(key)
        if (prior === undefined) Reflect.deleteProperty(window, key)
        else Reflect.set(window, key, prior)
      }
    },
  }
}

/** Resolve a dotted path like `'window.SiebelApp.Constants'` against a root object. */
function resolveDependency(path: string, root: Record<string, unknown>): unknown {
  const segments = path.split('.')
  const rest = segments[0] === 'window' ? segments.slice(1) : segments
  let current: unknown = root
  for (const segment of rest) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/** Minimal locale object: returns inputs unchanged. Real formatting lands with Phase 05 (LocaleData). */
function makeLocaleObject(): SiebelLocaleObject {
  return {
    GetStringFromDateTime: (value) => value,
    FormattedToString: (_dataType, value) => value,
    SetCurrencyCode: () => {},
    GetProfile: () => '',
    GetWeekStartDay: () => 0,
    GetDispCurrencyDecimal: () => '.',
    GetDispCurrencySeparator: () => ',',
    GetDispNumberDecimal: () => '.',
    GetDispNumberSeparator: () => ',',
    GetMonth: (month) => String(month),
    GetDayOfWeek: (day) => String(day),
  }
}
