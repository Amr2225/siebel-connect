// applet-store.ts: `createAppletStore(applet)` -> `{ subscribe, getSnapshot, getServerSnapshot, destroy }`.
//
// Phase 10 value-add (framework-agnostic, zero deps). This is the observable primitive the React
// hooks build on, but it is not React-specific: it adapts a `BaseApplet`'s BC-notification
// subscription (Phase 5 `subscribe`/`unsubscribe`) into the `useSyncExternalStore` contract.
//
// Why a store, not a fetch cache: Siebel's PM *owns* the record set and *pushes* changes via BC
// notifications. The store only *mirrors* that state; it never fetches or mutates. So the right
// primitive is a synchronous store keyed off the bridge's own notifications.
//
// Re-render minimisation hinges on **stable snapshot identity**: the snapshot object is recomputed
// only when a notification fires (`Notifications._invokeSubscriptions` on `SWE_PROP_BC_NOTI_END`),
// and `getSnapshot` returns that cached object on every call in between. A consumer using
// `useSyncExternalStore` therefore never tears and never loops, and selector hooks can do a cheap
// equality check against an unchanging reference.

import type BaseApplet from './BaseApplet'
import type { CurrentRecordState, SiebelRecord, SubscriptionToken } from './types'

/**
 * Immutable snapshot of an applet's reactive state. Recomputed only on a BC notification; the object
 * reference is stable between notifications so selectors can rely on identity. `recordSet` carries the
 * record index (`_indx`) so callers can feed it straight back into `positionOnRow`.
 */
export interface AppletSnapshot<T extends SiebelRecord = SiebelRecord> {
  readonly recordSet: readonly T[]
  readonly currentRecord: T | undefined
  readonly selection: number
  readonly recordState: CurrentRecordState
  readonly inQueryMode: boolean
}

/** Observable handle over one applet. Shape matches the `useSyncExternalStore` contract plus cleanup. */
export interface AppletStore<T extends SiebelRecord = SiebelRecord> {
  /** Register a change listener; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** The current snapshot. Stable reference between notifications. */
  getSnapshot(): AppletSnapshot<T>
  /** Empty snapshot for SSR / first paint, so the store never touches `window.SiebelApp` on the server. */
  getServerSnapshot(): AppletSnapshot<T>
  /** Unsubscribe from the applet's notifications and drop all listeners. */
  destroy(): void
}

/**
 * Shared empty snapshot used for the server/first-paint render. Frozen so its identity is reusable.
 * Note `createAppletStore` still reads the PM eagerly at construction (see `computeSnapshot`), so full
 * SSR relies on the applet never being initialised server-side; `getServerSnapshot` itself is the only
 * part guaranteed not to touch `window.SiebelApp`.
 */
const EMPTY_SNAPSHOT: AppletSnapshot = Object.freeze({
  recordSet: Object.freeze([]) as readonly SiebelRecord[],
  currentRecord: undefined,
  selection: -1,
  recordState: 0,
  inQueryMode: false,
})

/**
 * Read the applet's current reactive state into a fresh snapshot. Pulls the record set once (with the
 * record index) and derives the current record from the selection, so the underlying PM is read the
 * minimum number of times. `recordState === 3` is Siebel's query-mode state.
 */
function computeSnapshot<T extends SiebelRecord>(applet: BaseApplet<T>): AppletSnapshot<T> {
  const recordSet = applet.getRecordSet(true)
  const selection = applet.getSelection()
  const recordState = applet.calculateCurrentRecordState()
  return {
    recordSet,
    selection,
    currentRecord: selection >= 0 ? recordSet[selection] : undefined,
    recordState,
    inQueryMode: recordState === 3,
  }
}

/**
 * Build an {@link AppletStore} over `applet`. Subscribes once to the applet's BC notifications;
 * recomputes the snapshot only when one fires, then fans out to the registered listeners. Call
 * {@link AppletStore.destroy} to unsubscribe and release listeners (e.g. when the factory clears the key).
 */
export function createAppletStore<T extends SiebelRecord>(applet: BaseApplet<T>): AppletStore<T> {
  let snapshot = computeSnapshot(applet)
  const listeners = new Set<() => void>()

  // One subscription per store. The callback is anonymous, so `Notifications` keys it by its own
  // counter (a unique token) rather than by function name, so multiple stores never collide.
  const token: SubscriptionToken = applet.subscribe(() => {
    snapshot = computeSnapshot(applet)
    for (const listener of listeners) listener()
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT as AppletSnapshot<T>,
    destroy() {
      applet.unsubscribe(token)
      listeners.clear()
    },
  }
}
