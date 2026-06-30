// useApplet.ts: the all-in-one applet handle (the typed instance, its reactive snapshot, and an
// embedded async runner).
//
// This is the convenience hook. It re-renders once per BC notification batch (it reads the whole
// snapshot), so reach for the granular `useRecordSet` / `useCurrentRecord` when a component cares
// about one slice and re-render count matters. The returned `applet` is the same memoized instance
// `getApplet(key)` returns, so imperative calls and the reactive view stay in sync.

import { useCallback } from 'react'
import { useAppletSelector } from './internal'
import { useAsyncAction, type AsyncAction } from './useAsyncAction'
import { getApplet } from 'siebel-connect'
import type { Applet, AppletKey, RecordOf, CurrentRecordState } from 'siebel-connect'

/** The handle returned by {@link useApplet}: the typed instance, its snapshot, and an async runner. */
export interface AppletHandle<K extends AppletKey> {
  /** The memoized {@link Applet} instance for `key` (same reference `getApplet(key)` returns). */
  applet: Applet<RecordOf<K>>
  /** Reactive record set (carries `_indx`). */
  recordSet: readonly RecordOf<K>[]
  /** Reactive current record, or `undefined` when nothing is selected. */
  currentRecord: RecordOf<K> | undefined
  /** Reactive record state (`0` none … `5` read-only). */
  recordState: CurrentRecordState
  /** `true` when the applet is in query mode. */
  inQueryMode: boolean
  /** `true` while `save` / `run` is in flight. */
  pending: boolean
  /** The error from the last failed `save` / `run`, normalised to a `ConnectError`. */
  error: AsyncAction['error']
  /** Run an arbitrary async applet action, tracking `pending` / `error` (see {@link useAsyncAction}). */
  run: AsyncAction['run']
  /** Convenience: commit the current record (`writeRecord`) through `run`. */
  save: () => Promise<unknown>
}

/**
 * Reactive handle for applet `key`.
 *
 * ```tsx
 * const { applet, currentRecord, save, pending } = useApplet('accountForm')
 * applet.setControlValue('Name', 'Acme')
 * <button disabled={pending} onClick={save}>Save</button>
 * ```
 */
export function useApplet<K extends AppletKey>(key: K): AppletHandle<K> {
  const applet = getApplet(key)
  const snapshot = useAppletSelector(key, (s) => s)
  const { pending, error, run } = useAsyncAction()

  const save = useCallback(() => run(() => getApplet(key).writeRecord()), [key, run])

  return {
    applet,
    recordSet: snapshot.recordSet,
    currentRecord: snapshot.currentRecord,
    recordState: snapshot.recordState,
    inQueryMode: snapshot.inQueryMode,
    pending,
    error,
    run,
    save,
  }
}
