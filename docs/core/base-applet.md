# BaseApplet

`BaseApplet<TRecord>` is the generic base class wrapping a Siebel **Presentation Model** (PM). It is the
heart of the bridge, ported call-for-call from the legacy `NexusBaseApplet`, and is subclassed by
[`Applet`](#) and `PopupApplet` (siblings, not a chain). The `TRecord` type parameter is the record
shape this applet's Business Component yields; it flows through every record accessor, so
`getApplet('accounts').getCurrentRecord()` is typed `Account | undefined`, never `any`.

```ts
import { BaseApplet } from 'siebel-connect'

const applet = new BaseApplet<Account>({ pm }) // normally built for you by the factory (Phase 9)
const rows = applet.getRecordSet()             // Account[]
const current = applet.getCurrentRecord()      // Account | undefined
```

The constructor takes a [`BaseAppletSettings`](./types.md): the required `pm`, the conversion flags
(`convertDates`, `returnRawNumbers`, `returnRawIntegers`, `returnRawCurrencies`), the popup flags
(`isMvgAssoc`, `isPopup`), and `debug`. It wires up: the Siebel constants table, the active view and
applet name, the list-vs-form detection, the `required[]` control array (from list columns or the DOM),
the [`LocaleData`](./locale-data.md) singleton, the `fieldToControlMap`, a [`Notifications`](./notifications.md)
engine, the `UpdateQuickPickInfo` dynamic-LOV binding, and a tree-applet warning.

## What changed in the port

Behaviour is identical to the legacy bridge; only three things move, each plan-sanctioned:

1. **Generics.** `TRecord` threads through `getRecordSet`, `getCurrentRecord`, `getControlsRecordSet`,
   and friends.
2. **Typed errors.** String throws became [`ConnectError`](./errors.md) subclasses with the **exact**
   original message text, so call sites can discriminate by class (`PositionError`,
   `ReadonlyControlError`, `ControlNotFoundError`, `QueryModeError`, base `ConnectError`).
3. **Pluggable diagnostics.** The legacy unconditional `console.log/warn/error` route through the
   debug-gated [logger](./logging.md). Throwing is unaffected.

Runtime **method-name** strings (`'CreateRecord'`, `'ExecuteQuery'`, the `[NB]` prefixes) are kept
verbatim to preserve the behavioural surface.

## Subscriptions

| Method | Description |
| ------ | ----------- |
| `subscribe(fn)` | Register a change listener; returns a `SubscriptionToken`. Delegates to [`Notifications`](./notifications.md). |
| `unsubscribe(token)` | Remove a listener by token; returns its former index or `-1`. |
| `invokeSubscriptions()` | Force-invoke all subscribers (normally driven by the BC `END` notification). |

## Record sets

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getRecordSet(addRecordIndex?)` | `TRecord[]` | Cloned record set; backfills missing `Id` (outside query mode) and, for form applets, formatted field values. `addRecordIndex` adds `_indx`. |
| `getRawRecordSet(addRecordIndex?)` | `TRecord[]` | Raw, unformatted clones. |
| `getControlsRecordSet(addRecordIndex?)` | `TRecord[]` | Each row reduced to `Id` plus control-mapped, JS-converted values. |
| `getControlsRecordsObject(addRecordIndex?)` | `Record<string, TRecord>` | `getControlsRecordSet` keyed by `Id`. |
| `getCurrentRecord(raw?)` | `TRecord \| undefined` | The selected record (raw or formatted). |

## Controls & metadata

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getControls()` | `Record<string, ControlModel>` | Static metadata for every non-skipped control, plus a synthesized `Id`. |
| `getListColumns()` | `Record<string, ControlModel>` | List-column metadata. Throws `ConnectError` on a form applet. |
| `getCurrentRecordModel(controls?, methods?)` | `RecordModel` | Per-control runtime state (`value`, `readonly`, `isLink`, …) for the current record, plus method invocability and the record `state`/`id`. |
| `getControlDisplayFormat(uiType)` | `string` | Locale date/datetime format for date controls, else `''`. |
| `setControlValue(name, value)` | `unknown` | Set a control value (with checkbox/date conversion). Throws `ControlNotFoundError` if missing, `ReadonlyControlError` if read-only. |

## Navigation & position

| Method | Description |
| ------ | ----------- |
| `getRowListRowCount()` / `getNumRows()` / `getSelection()` | Row-window counts and the current selection index. |
| `nextRecord(opts?)` / `prevRecord(opts?)` | Move one record (list) or one set (form). `{ async }` for a promise. |
| `nextRecordSet(opts?)` / `prevRecordSet(opts?)` | Move one record set (list applets only). |
| `positionOnRow(index, keys?, skipIfAlreadyPositioned?)` | Select a row by index. Throws `PositionError` for non-list applets, non-integer / negative / out-of-range indices, or when positioning does not take effect. |
| `getPaginationInfo()` | `{ start, end, total, hasMore, current }` snapshot. |
| `sort(controlName, isAscending?)` | Sort by a column (list applets only); returns `false` on form applets. |

## CRUD

| Method | Description |
| ------ | ----------- |
| `newRecord(cb?)` / `newRecordSync()` | Create a record (async promise / sync). Uses `CreateRecord`. |
| `writeRecord(cb?, cberr?)` / `writeRecordSync()` | Commit the record; the async form resolves on a `Completed` status. |
| `deleteRecordSync(skipConfirmDialog?)` | Delete the current record, optionally suppressing the confirm dialog. |
| `undoRecordSync()` | Undo pending changes. |
| `calculateCurrentRecordState()` | `0` none · `1` creating · `2` editing · `3` query mode · `4` displayed · `5` read-only. |

## Query

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `query(params, cb?, checkQueryMode?)` | `Promise<unknown>` | Enter query mode, set control values from `params`, execute; resolves to the result count. |
| `queryById(rowId, cb?, checkQueryMode?, controlName?)` | `Promise<unknown>` | Query a single `Id`. |
| `queryBySearchExpr(expr, checkQueryMode?, controlName?)` | `Promise<unknown>` | Query with a raw Siebel search expression. |
| `queryByIdSync` / `queryBySearchExprSync` | `number` | Synchronous variants returning the record count. |
| `getMVF(ids, fields, useActiveBO?)` | `Promise<MvfResult>` | Fetch multi-value fields for the given record ids via the `Nexus BS` business service. |

Entering query mode when the applet refuses throws `QueryModeError` (`[NB]The applet is not in Query
Mode`); a missing search control throws `ControlNotFoundError`.

## LOVs

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getLOV(controlName)` | `unknown` | Static list for static-bounded controls, else the dynamic LOV. |
| `getStaticLOV(controlName)` | `string[]` | Static picklist values (validates the control is static). |
| `getDynamicLOV(controlName)` | `unknown` | Dynamic picklist values (validates the control is a combobox). |
| `isStatic(control)` / `isDynamic(control)` | `boolean` | Picklist-kind predicates. |

## Methods & invocation

| Method | Description |
| ------ | ----------- |
| `canInvokeMethod(method)` | Whether the PM allows the named method now. |
| `invokeMethod(method, opts?)` | Invoke a PM method; returns `false` if it cannot be invoked, a promise when `{ async }`, else the sync result. |

## Preferences

| Method | Description |
| ------ | ----------- |
| `savePref(name, value)` | Persist an applet/view-scoped user preference string. |
| `readPref(name)` | Read a preference back from the PM. |

## Popup type

| Method | Returns | Description |
| ------ | ------- | ----------- |
| `getPopupType()` | `PopupType` | `'pick' \| 'mvg' \| 'mvgassoc' \| 'assoc' \| 'popup' \| null` for the currently visible popup. |

## Statics

| Method | Description |
| ------ | ----------- |
| `BaseApplet.GetPropSet(control)` | Flatten a control's PM property set to `{ prop, val }[]`. |
| `BaseApplet.GetControlStaticLOV(control)` | Static-LOV display names for a radio-group control. |
| `BaseApplet.Requery(name)` / `BaseApplet.Refresh(name)` | Drive the `Nexus BS` business service to requery / refresh a named applet. |
