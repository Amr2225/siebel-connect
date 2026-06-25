// Core type foundation for siebel-connect.
//
// The registry types (`AppletRegistry`, `RecordOf`) are the inference engine: consumers
// augment `AppletRegistry`, and every typed accessor flows the right record type through.

/** Base shape every Siebel record satisfies. `Id` is always present; other fields are open. */
export interface SiebelRecord {
  Id: string
  [field: string]: unknown
}

/**
 * Augmented by consumers to map applet keys to their record types:
 *
 * ```ts
 * declare module 'siebel-connect' {
 *   interface AppletRegistry { accountList: Account }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation seam; intentionally empty
export interface AppletRegistry {}

/** Union of registered applet keys. `never` until the consumer augments `AppletRegistry`. */
export type AppletKey = keyof AppletRegistry

/** The record type registered for applet key `K`, falling back to `SiebelRecord`. */
export type RecordOf<K extends AppletKey> = AppletRegistry[K] extends SiebelRecord
  ? AppletRegistry[K]
  : SiebelRecord

declare const subscriptionTokenBrand: unique symbol

/**
 * Opaque handle returned by `subscribe`, branded so a raw `string`/`number` can't be passed where a
 * token is expected. The underlying primitive is `string | number`: the bridge keys named-function
 * subscribers by their name (`string`) and anonymous ones by a counter (`number`).
 */
export type SubscriptionToken = (string | number) & { readonly [subscriptionTokenBrand]: never }

/** Kind of the currently open Siebel popup, or `null` when none is visible. */
export type PopupType = 'pick' | 'mvg' | 'mvgassoc' | 'assoc' | 'popup' | null

/**
 * State of the applet's current record:
 * `0` no records · `1` being created · `2` being edited · `3` query mode ·
 * `4` displayed · `5` read-only.
 */
export type CurrentRecordState = 0 | 1 | 2 | 3 | 4 | 5

/** Pagination snapshot from `getPaginationInfo`. */
export interface PaginationInfo {
  start: number
  end: number
  total: number
  hasMore: boolean
  current: number
}

/**
 * Per-applet construction settings. The factory (Phase 9) builds one of these per applet from the
 * global {@link ConnectSettings} plus the popup-detection flags, then hands it to the `BaseApplet`
 * constructor. Mirrors the legacy `settings` object read in `NexusBaseApplet`'s constructor.
 */
export interface BaseAppletSettings {
  /** The Presentation Model this applet wraps. Required: the constructor throws without it. */
  pm: SiebelPresentationModel
  convertDates?: boolean
  returnRawNumbers?: boolean
  returnRawIntegers?: boolean
  returnRawCurrencies?: boolean
  /** Set by the factory when the applet is an MVG association applet. */
  isMvgAssoc?: boolean
  /** Set by the factory when the applet is a popup applet. */
  isPopup?: boolean
  /** Forwarded to {@link Notifications} to attach the noisy debug passthrough handlers. */
  debug?: boolean
}

/** Options accepted when initialising the bridge / an applet. */
export interface ConnectSettings {
  /** Convert Siebel date/time strings to/from JS `Date`. */
  convertDates?: boolean
  /** Return unformatted numbers (list applets) instead of locale-formatted strings. */
  returnRawNumbers?: boolean
  /** Return unformatted integers instead of locale-formatted strings. */
  returnRawIntegers?: boolean
  /** Return unformatted currencies instead of locale-formatted strings. */
  returnRawCurrencies?: boolean
  /** Log accepted/skipped BC notifications and other debug output. */
  debug?: boolean
}

/** Pluggable sink for the bridge's diagnostic output. */
export interface Logger {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** A single Siebel control's property-set entry. */
export interface ControlProp {
  prop: string
  val: unknown
}

/**
 * Static metadata for one applet control, as returned by `getControls` / `getListColumns`.
 *
 * The per-record runtime model (`RecordModel` / per-control `ControlState`) is deferred to Phase 6:
 * the legacy `getCurrentRecordModel` returns a controls map with `state`/`id` keys mixed in, which
 * can't be typed without an index-signature conflict until the accessor is ported and its shape fixed.
 */
export interface ControlModel {
  name: string
  label: string
  uiType: string
  required: boolean
  boundedPick: boolean
  staticPick: boolean
  inputName: string
  isPostChanges: boolean
  maxSize: number
  fieldName: string
  isLink: boolean
  readonly: boolean
  displayFormat: string
  dataType: string
  isLOV: boolean
  currencyCodeField: string
  /** Raw `control.GetPopupType()` string — distinct from the open-popup {@link PopupType} union. */
  popupType: string
  props: ControlProp[]
  isSortable: boolean
  iconMap: unknown
  methodName: string
  isListColumn: boolean
  /** Present only for static-bounded picklists. */
  options?: string[]
}

/**
 * Field-name → owning-control metadata, built once in the constructor by `_getFieldToControlMap`.
 * Keyed by Siebel field name (not control name). Used to format form-applet record values and to
 * tell {@link Notifications} which control a changed field belongs to (only `uiType` is read there).
 */
export interface FieldControlInfo {
  name: string
  isPostChanges: boolean
  uiType: string
  displayFormat: string
  dataType: string
  currencyCodeField: string
}

/**
 * Runtime state of one control for the current record, as produced by `getCurrentRecordModel`. The
 * `value` is already converted to its JS form (checkbox → boolean, date → `Date`, raw number/currency
 * → number) by `_getJSValue`.
 */
export interface ControlState {
  value: unknown
  readonly: boolean
  isLink: boolean
  uiType: string
  label: string
  isPostChanges: boolean
  required: boolean
  maxSize: number
  fieldName: string
  displayFormat: string
  isLOV: boolean
  dataType: string
  currencyCodeField: string
  currencyCode: string
  name: string
  iconMap: unknown
  isListColumn: boolean
}

/**
 * The `getCurrentRecordModel` result: a per-control state map (carrying the record `state` and `id`
 * alongside the control entries, exactly as the legacy object did) plus a method-invocability map.
 */
export interface RecordModel {
  controls: Record<string, ControlState> & { state: CurrentRecordState; id: string }
  methods: Record<string, boolean>
}

/**
 * Result of `getMVF`: `{ [fieldName]: { [requestedFieldGroup]: record[] } }`. Each record is a plain
 * property-set object with `SSA Primary Field` already converted to a boolean.
 */
export type MvfResult = Record<string, Record<string, Array<Record<string, unknown>>>>
