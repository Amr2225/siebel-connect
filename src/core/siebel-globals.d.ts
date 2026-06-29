// Ambient declarations for the Siebel Open UI globals the bridge talks to.
//
// Typed from observed usage in the original nexus-bridge. The Siebel boundary is
// intentionally conservative: polymorphic accessors (`PresentationModel.Get`,
// `ExecuteMethod`) return `unknown` so callers must narrow. Method overloads get
// added as later phases port the classes that need them.
//
// This file is a global script (no imports/exports). It is shipped verbatim as the
// `siebel-connect/siebel-globals` entry point.

/** Lookup table of Siebel constant keys (e.g. `SWE_CTRL_MVG`) → their string values. */
interface SiebelConstants {
  get(key: string): string
}

/** Siebel property set — the nested key/value + child tree used across the OUI API. */
interface SiebelPropertySet {
  SetProperty(key: string, value: unknown): void
  GetProperty(key: string): string
  SetType(type: string): void
  GetType(): string
  AddChild(child: SiebelPropertySet): void
  Clone(): SiebelPropertySet
  GetChildByType(type: string): SiebelPropertySet | undefined
  propArray: Record<string, string>
  childArray: SiebelPropertySet[]
}

/** A Siebel applet control (field, button, list column). String-coded booleans are kept as-is. */
interface SiebelControl {
  GetName(): string
  GetUIType(): string
  GetInputName(): string
  GetFieldName(): string
  GetDisplayName(): string
  GetDisplayFormat(): string
  GetMaxSize(): number
  GetMethodName(): string
  GetPopupType(): string
  GetCurrField(): string
  /** Siebel returns the string `'1'` / `'0'`, not a boolean. */
  IsStaticBounded(): string
  /** Siebel returns the string `'1'` / `'0'`, not a boolean. */
  IsBoundedPick(): string
  IsPostChanges(): boolean
  IsSortable(): boolean
  GetIconMap(): unknown
  GetPMPropSet(): SiebelPropertySet
  GetRadioGroupPropSet(): SiebelPropertySet
  GetMethodPropSet(): SiebelPropertySet
}

interface SiebelUIWrapper {
  UpdatePickList(lov: unknown): void
}

interface SiebelRenderer {
  GetUIWrapper(control: SiebelControl): SiebelUIWrapper | undefined
}

interface SiebelBusComp {
  GetName(): string
  IsInsertPending(): boolean
  IsCommitPending(): boolean
}

/** Presentation Model — the per-applet jQuery-era controller the bridge wraps. */
interface SiebelPresentationModel {
  /** Polymorphic getter keyed by Siebel property name; narrow at the call site. */
  Get(name: string): unknown
  /** Polymorphic invoker keyed by Siebel method name; narrow at the call site. */
  ExecuteMethod(name: string, ...args: unknown[]): unknown
  OnControlEvent(event: string, ...args: unknown[]): unknown
  SetProperty(key: string, value: unknown): unknown
  AddProperty(key: string, value: unknown): void
  AttachNotificationHandler(type: string, handler: (propSet: SiebelPropertySet) => void): void
  AttachPMBinding(name: string, handler: (...args: unknown[]) => void, options?: { scope?: unknown }): void
  GetRenderer(): SiebelRenderer | undefined
  Setup(): void
  Init(): void
  EndLife(): void
}

interface SiebelApplet {
  GetName(): string
  GetPModel(): SiebelPresentationModel
}

interface SiebelView {
  GetName(): string
  GetApplet(name: string): SiebelApplet | undefined
}

interface SiebelBusObject {
  GetName(): string
}

/** Siebel's Y/N ↔ boolean datum converter. */
interface SiebelBoolObject {
  SetValue(value: unknown): void
  GetAsString(): string
  SetAsString(value: string): void
  GetValue(): boolean
}

interface SiebelLocaleObject {
  GetStringFromDateTime(value: string, fromFormat: string, toFormat: string, keepSeparators: boolean): string
  FormattedToString(dataType: string, value: string, displayFormat: string): string
  SetCurrencyCode(code: string): void
  GetProfile(key: string): string
  GetWeekStartDay(): number
  GetDispCurrencyDecimal(): unknown
  GetDispCurrencySeparator(): unknown
  GetDispNumberDecimal(): unknown
  GetDispNumberSeparator(): unknown
  GetMonth(month: number, short: boolean): string
  GetDayOfWeek(day: number, type: number): string
}

interface SiebelService {
  InvokeMethod(name: string, inputs: SiebelPropertySet, options: object): unknown
}

interface SiebelCommandInstance {
  InvokeCommand(command: string, ...args: unknown[]): unknown
}

/** `window.SiebelApp.S_App` — the application singleton. */
interface SiebelSApp {
  GetActiveView(): SiebelView
  GetActiveBusObj(): SiebelBusObject
  GetPopupPM(): SiebelPresentationModel
  NewPropertySet(): SiebelPropertySet
  GetService(name: string): SiebelService
  GetPageURL(): string
  GetAppExtension(): string
  LookupStringCache(value: string): string
  GetIconMap(): Record<string, unknown>
  GotoView(viewName: string, ...args: unknown[]): unknown
  /** Monkey-patched by the popup controller, hence a mutable property. */
  ProcessNewPopup(propSet: SiebelPropertySet): unknown
  LocaleObject: SiebelLocaleObject
  DatumBoolObject: new () => SiebelBoolObject
}

interface SiebelEventManager {
  /** Siebel's real (misspelled) API name — kept verbatim. */
  addListner(event: string, handler: (...args: unknown[]) => void, scope?: unknown): void
}

interface SiebelCommandManager {
  GetInstance(): SiebelCommandInstance
}

interface SiebelUtils {
  /** Reassigned by `deleteRecordSync` to suppress the confirm dialog. */
  Confirm: (...args: unknown[]) => boolean
}

interface SiebelAppGlobal {
  S_App: SiebelSApp
  Constants: SiebelConstants
  EventManager: SiebelEventManager
  CommandManager: SiebelCommandManager
  Utils: SiebelUtils
}

interface SiebelJSGlobal {
  /** Resolves a dotted global path (e.g. `'window.SiebelApp.Constants'`). */
  Dependency(path: string): unknown
}

/**
 * A bridge applet instance as registered in `SiebelAppFacade.NB` and tracked by the popup controller.
 * Structurally satisfied by `BaseApplet` (and its `PopupApplet` subclass); declared here so the
 * ambient boundary can name it without importing the class.
 */
interface NexusBridgeInstance {
  readonly pm: SiebelPresentationModel
  readonly appletName: string
  // `| undefined` (not just optional): the bridge classes type these as `boolean | undefined`, which
  // is only assignable here under exactOptionalPropertyTypes when the target also admits `undefined`.
  readonly isPopup?: boolean | undefined
  readonly isMvgAssoc?: boolean | undefined
}

interface SiebelAppFacadeGlobal {
  NB?: Record<string, NexusBridgeInstance>
  NexusProcessNewPopup?: (propSet: SiebelPropertySet) => unknown
  ExplorerPresentationModel?: unknown
  _NBPopupController?: unknown
  [key: string]: unknown
}

interface Window {
  SiebelApp: SiebelAppGlobal
  SiebelJS: SiebelJSGlobal
  SiebelAppFacade: SiebelAppFacadeGlobal
}
