---
title: "React hooks"
description: "Typed React hooks over the applet store, with each hook's return shape."
---

# React hooks

The `siebel-connect/react` entry exposes typed hooks over the [applet store](./store.md). They are
built on `useSyncExternalStoreWithSelector` with value-based selectors, so a component re-renders **at
most once per relevant BC notification batch**, and not at all when an accepted-but-unrelated
notification leaves its slice unchanged.

```ts
import {
  useApplet,
  useRecordSet,
  useCurrentRecord,
  useQueryMode,
  useAsyncAction,
} from 'siebel-connect/react'
```

> React 17+ is a peer dependency. The hooks read the registry via [`getApplet`](../core/factory.md) /
> `getAppletStore`, so the applet must be [initialised](../getting-started/init.md) first.

## At a glance

| Hook | Signature | Returns |
| ---- | --------- | ------- |
| [`useRecordSet`](#userecordset) | `useRecordSet<K>(key): readonly RecordOf<K>[]` | The reactive record set (each row carries `_indx`). |
| [`useCurrentRecord`](#usecurrentrecord) | `useCurrentRecord<K>(key): RecordOf<K> \| undefined` | The selected record, or `undefined`. |
| [`useApplet`](#useapplet) | `useApplet<K>(key): AppletHandle<K>` | The all-in-one handle: instance, snapshot slices, async runner. |
| [`useQueryMode`](#usequerymode) | `useQueryMode<K>(key): QueryMode` | `inQueryMode` plus `enter` / `execute` / `cancel`. |
| [`useAsyncAction`](#useasyncaction) | `useAsyncAction(): AsyncAction` | `{ pending, error, run, reset }` for any async op. |

## Choosing a hook

`useRecordSet` and `useCurrentRecord` are the **granular** hooks: select one slice, re-render only when
that slice changes. `useApplet` is the **convenience** hook: it reads the whole snapshot, so it
re-renders once per notification batch regardless of which field you use. Prefer the granular hooks when
re-render count matters.

## `useRecordSet`

The reactive record set for a list applet, typed by your registry.

```tsx
function AccountList() {
  const rows = useRecordSet('accountList') // readonly Account[]
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.Id} onClick={() => getApplet('accountList').positionOnRow(r._indx as number)}>
          {r.Name}
        </li>
      ))}
    </ul>
  )
}
```

**Returns** `readonly RecordOf<K>[]`. Each row is your record type plus `_indx` (its BC position):

```ts
const rows = useRecordSet('accountList')
// [
//   { Id: '1-ABC', Name: 'Acme',  Location: 'New York', _indx: 0 },
//   { Id: '1-DEF', Name: 'Beta',  Location: 'London',   _indx: 1 },
// ]
```

Uses element-wise shallow equality, so an accepted notification that leaves every row unchanged does
not re-render; any added, removed, or edited row does.

## `useCurrentRecord`

The currently selected record for an applet.

```tsx
function AccountName() {
  const account = useCurrentRecord('accountForm') // Account | undefined
  return <span>{account?.Name}</span>
}
```

**Returns** `RecordOf<K> | undefined`:

```ts
const account = useCurrentRecord('accountForm')
// { Id: '1-ABC', Name: 'Acme', Location: 'New York', _indx: 0 }
// or undefined when nothing is selected
```

Uses shallow equality on the record, so two distinct objects with identical fields compare equal and
reading `account?.Name` stays stable across unrelated record-set churn.

## `useApplet`

The all-in-one handle: the typed instance, its reactive snapshot slices, and an embedded async runner.
The `applet` is the same memoized instance `getApplet(key)` returns, so imperative calls and the
reactive view stay in sync.

```tsx
function AccountEditor() {
  const { applet, currentRecord, save, pending } = useApplet('accountForm')
  return (
    <>
      <input
        defaultValue={currentRecord?.Name}
        onChange={(e) => applet.setControlValue('Name', e.target.value)}
      />
      <button disabled={pending} onClick={save}>
        Save
      </button>
    </>
  )
}
```

**Returns** `AppletHandle<K>`:

```ts
const handle = useApplet('accountForm')
// {
//   applet:        Applet<Account>,        // the memoized instance (same as getApplet('accountForm'))
//   recordSet:     readonly Account[],     // [{ Id, Name, Location, _indx }, ...]
//   currentRecord: Account | undefined,    // { Id, Name, Location, _indx } or undefined
//   recordState:   2,                       // 0 none|1 creating|2 editing|3 query|4 displayed|5 read-only
//   inQueryMode:   false,
//   pending:       false,                   // true while save / run is in flight
//   error:         undefined,               // ConnectError | undefined from the last save / run
//   run:           (action) => Promise<R | undefined>,
//   save:          () => Promise<unknown>,  // run(() => applet.writeRecord())
// }
```

It re-renders once per notification batch (it reads the whole snapshot). Reach for the granular hooks
when a component only needs one slice.

## `useQueryMode`

Drives Siebel query mode by invoking the existing applet methods only (no behaviour is added): `enter`
runs `NewQuery`, `execute` runs the search expression via `queryBySearchExpr`, and `cancel` runs
`UndoQuery`. `inQueryMode` reflects the store snapshot, so it updates when Siebel emits the
corresponding state notification.

```tsx
function SearchBar() {
  const { inQueryMode, enter, execute, cancel } = useQueryMode('accountList')
  // ...render an input that calls execute('[Name] = "Acme"')
}
```

**Returns** `QueryMode`:

```ts
const q = useQueryMode('accountList')
// {
//   inQueryMode: false,                                   // boolean (record state 3)
//   pending:     false,                                   // true while a transition is in flight
//   error:       undefined,                               // ConnectError | undefined
//   enter:       () => Promise<unknown>,                  // NewQuery
//   execute:     (expr, controlName?) => Promise<unknown>,// ExecuteQuery via queryBySearchExpr
//   cancel:      () => Promise<unknown>,                  // UndoQuery
// }
```

See [Querying](../guides/querying.md) for the expression syntax.

## `useAsyncAction`

Wraps one async applet call so a component can drive it from an event handler and render its `pending` /
`error` state without hand-rolling the same try/finally each time. `run` resolves to the action's
result, or `undefined` if it failed (the error is surfaced via `error`, not rethrown). Errors are
normalised to a [`ConnectError`](../core/errors.md): thrown `ConnectError`s pass through; bare
rejections (e.g. `writeRecord`'s `reject()`) become a generic `ConnectError` with the original reason as
`cause`.

```tsx
function SaveButton() {
  const { run, pending, error } = useAsyncAction()
  return (
    <>
      <button disabled={pending} onClick={() => run(() => getApplet('accountForm').writeRecord())}>
        Save
      </button>
      {error && <p role="alert">{error.message}</p>}
    </>
  )
}
```

**Returns** `AsyncAction`:

```ts
const action = useAsyncAction()
// {
//   pending: false,                                       // true while a run is in flight
//   error:   undefined,                                   // ConnectError | undefined (cleared on next run)
//   run:     (action) => Promise<R | undefined>,          // returns undefined if the action failed
//   reset:   () => void,                                  // clear pending + error
// }
```

## Re-render minimisation

The hooks rely on the store's [stable snapshot identity](./store.md#stable-snapshot-identity):

- The snapshot reference changes **only** on a BC notification.
- `useRecordSet` uses element-wise shallow equality: an accepted notification that leaves every row
  unchanged does not re-render.
- `useCurrentRecord` uses shallow equality on the record: two distinct objects with identical fields
  compare equal, so reading `currentRecord?.Name` stays stable across unrelated record-set churn.
- `getServerSnapshot` keeps the first paint / SSR off `window.SiebelApp`.
