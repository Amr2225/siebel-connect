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

## API

| Hook | Signature | Description |
| ---- | --------- | ----------- |
| `useRecordSet` | `useRecordSet<K>(key): readonly RecordOf<K>[]` | The reactive record set (carries `_indx`). Re-renders only when a row is added/removed/edited. |
| `useCurrentRecord` | `useCurrentRecord<K>(key): RecordOf<K> \| undefined` | The selected record. Shallow-equal, so reading one field is stable across unrelated churn. |
| `useApplet` | `useApplet<K>(key): AppletHandle<K>` | The all-in-one handle: the typed instance, snapshot slices, and an embedded async runner. |
| `useQueryMode` | `useQueryMode<K>(key): QueryMode` | `inQueryMode` plus `enter` / `execute` / `cancel` transitions. |
| `useAsyncAction` | `useAsyncAction(): AsyncAction` | `{ pending, error, run, reset }` for any async applet operation. |

## Choosing a hook

`useRecordSet` and `useCurrentRecord` are the **granular** hooks: select one slice, re-render only when
that slice changes. `useApplet` is the **convenience** hook: it reads the whole snapshot, so it
re-renders once per notification batch regardless of which field you use. Prefer the granular hooks
when re-render count matters.

```tsx
function AccountList() {
  const rows = useRecordSet('accountList')            // Account[]
  const { run, pending } = useAsyncAction()
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.Id} onClick={() => run(() => getApplet('accountList').positionOnRow(r._indx as number))}>
            <td>{r.Name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

## `useApplet`

```tsx
const { applet, currentRecord, recordState, save, pending, error, run } = useApplet('accountForm')
applet.setControlValue('Name', 'Acme')
<button disabled={pending} onClick={save}>Save</button>   // save = run(() => applet.writeRecord())
```

`applet` is the same memoized instance `getApplet(key)` returns, so imperative calls and the reactive
view stay in sync.

## `useAsyncAction`

Wraps one async applet call, tracking the surrounding UI state. `run` resolves to the action's result,
or `undefined` if it failed (the error is surfaced via `error`, not rethrown). Errors are normalised to
a [`ConnectError`](../core/errors.md): thrown `ConnectError`s pass through; bare rejections (e.g.
`writeRecord`'s `reject()`) become a generic `ConnectError` with the original reason as `cause`.

```tsx
const { run, pending, error } = useAsyncAction()
<button disabled={pending} onClick={() => run(() => getApplet('accountForm').writeRecord())}>Save</button>
{error && <p role="alert">{error.message}</p>}
```

## `useQueryMode`

Drives Siebel query mode by invoking the existing applet methods only (no bridge behaviour is added):
`enter` runs `NewQuery`, `execute` runs the search expression (`ExecuteQuery` via `queryBySearchExpr`),
and `cancel` runs `UndoQuery`. `inQueryMode` reflects the store snapshot, so it updates when Siebel
emits the corresponding state notification.

```tsx
const { inQueryMode, enter, execute, cancel, pending } = useQueryMode('accountList')
```

## Re-render minimisation

The hooks rely on the store's [stable snapshot identity](./store.md#stable-snapshot-identity):

- The snapshot reference changes **only** on a BC notification.
- `useRecordSet` uses element-wise shallow equality: an accepted notification that leaves every row
  unchanged does not re-render.
- `useCurrentRecord` uses shallow equality on the record: two distinct objects with identical fields
  compare equal, so reading `currentRecord?.Name` stays stable across unrelated record-set churn.
- `getServerSnapshot` keeps the first paint / SSR off `window.SiebelApp`.
