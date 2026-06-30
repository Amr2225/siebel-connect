// internal.ts — shared plumbing for the React hooks. Not part of the public surface.
//
// Everything here imports core through the package's own `siebel-connect` entry (not a relative
// `../core/*` path). Combined with `external: ['siebel-connect']` in tsup, that guarantees the react
// bundle reuses the single core instance instead of inlining its own copy — so `getAppletStore` here
// reads the exact same factory memo a consumer initialised through `init`.

import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'
import { getAppletStore } from 'siebel-connect'
import type { AppletKey, RecordOf, AppletSnapshot } from 'siebel-connect'

/**
 * Subscribe a component to the memoized {@link AppletStore} for `key`, projecting the snapshot through
 * `selector` and re-rendering only when the projection changes under `isEqual` (default `Object.is`).
 *
 * The store's snapshot reference is stable between BC notifications, so with a slice selector plus a
 * value-based `isEqual` a component re-renders at most once per relevant notification batch — and not
 * at all when an accepted-but-unrelated notification leaves its slice unchanged.
 */
export function useAppletSelector<K extends AppletKey, S>(
  key: K,
  selector: (snapshot: AppletSnapshot<RecordOf<K>>) => S,
  isEqual?: (a: S, b: S) => boolean
): S {
  // `getAppletStore` is memoized per key in the factory, so this returns a stable store across renders.
  const store = getAppletStore(key)
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
    selector,
    isEqual
  )
}

/**
 * Shallow structural equality: `Object.is` on primitives, else same own-key set with `Object.is` per
 * value. Two distinct record objects with identical fields compare equal, which is what lets an
 * accepted-but-unrelated notification (new object, same values) skip the re-render.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  const bKeys = Object.keys(bRecord)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key) || !Object.is(aRecord[key], bRecord[key])) {
      return false
    }
  }
  return true
}

/** Element-wise shallow equality for record sets: same length and every record {@link shallowEqual}. */
export function recordSetEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (!shallowEqual(a[i], b[i])) return false
  }
  return true
}
