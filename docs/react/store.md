# Applet store

The store is the framework-agnostic primitive the React hooks build on. It adapts an applet's BC
notification subscription (the [Notifications](../core/notifications.md) engine) into the
[`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) contract, with no
React dependency and no external cache.

```ts
import { createAppletStore, getAppletStore } from 'siebel-connect'
```

## Why a store, not a fetch cache

Siebel's Presentation Model *owns* the record set and *pushes* changes through BC notifications. The
store only **mirrors** that state, it never fetches or mutates. So the right primitive is a synchronous
store keyed off the bridge's own notifications, not a query cache.

## `getAppletStore(key)`

The factory memoizes **one store per applet key**, so every component reading the same applet shares a
single BC subscription. This is what the hooks call internally; reach for it directly only for
non-React consumers.

| Function | Signature | Description |
| -------- | --------- | ----------- |
| `getAppletStore` | `getAppletStore<K>(key: K): AppletStore<RecordOf<K>>` | The memoized store for `key`. Throws `AppletNotFoundError` if the key was never `init`ed. |
| `createAppletStore` | `createAppletStore<T>(applet: BaseApplet<T>): AppletStore<T>` | Build a store over an applet instance directly (advanced / testing). |

The store lifecycle is tied to the factory: `init` (destructive rebuild) and `clear` both `destroy`
the affected stores, so a store never outlives its applet.

## The store contract

```ts
interface AppletStore<T extends SiebelRecord> {
  subscribe(listener: () => void): () => void   // returns an unsubscribe function
  getSnapshot(): AppletSnapshot<T>              // stable reference between notifications
  getServerSnapshot(): AppletSnapshot<T>        // empty snapshot, SSR-safe
  destroy(): void                               // unsubscribe + drop listeners
}

interface AppletSnapshot<T extends SiebelRecord> {
  readonly recordSet: readonly T[]      // carries `_indx` for positionOnRow
  readonly currentRecord: T | undefined
  readonly selection: number
  readonly recordState: CurrentRecordState
  readonly inQueryMode: boolean
}
```

## Stable snapshot identity

The snapshot object is recomputed **only** when a notification fires
(`SWE_PROP_BC_NOTI_END` after at least one accepted notification). Between notifications, `getSnapshot`
returns the same reference. That is what lets a consumer:

- never tear and never loop (the `useSyncExternalStore` requirement), and
- bail out of a re-render with a cheap equality check against an unchanging reference.

`getServerSnapshot` returns a shared empty snapshot, so the first paint / SSR never touches
`window.SiebelApp`.
