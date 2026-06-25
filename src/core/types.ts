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
