// useQueryMode.ts: enter / execute / cancel Siebel query mode from React.
//
// Reads the live query-mode flag from the applet store and exposes the three transitions as async
// actions. Each transition only *invokes existing* applet/BC methods (`NewQuery`, `ExecuteQuery` via
// `queryBySearchExpr`, `UndoQuery`), so no bridge behaviour is added or changed. The `inQueryMode` flag
// reflects the store snapshot, so it updates when Siebel emits the corresponding state notification.

import { useCallback } from 'react'
import { useAppletSelector } from './internal'
import { useAsyncAction, type AsyncAction } from './useAsyncAction'
import { getApplet } from 'siebel-connect'
import type { AppletKey } from 'siebel-connect'

/** Query-mode state and transitions returned by {@link useQueryMode}. */
export interface QueryMode {
  /** `true` when the applet is in query mode (record state `3`). Driven by the store snapshot. */
  inQueryMode: boolean
  /** `true` while a transition (`enter` / `execute` / `cancel`) is in flight. */
  pending: boolean
  /** The error from the last failed transition, normalised to a `ConnectError`. */
  error: AsyncAction['error']
  /** Enter query mode (`NewQuery`). */
  enter: () => Promise<unknown>
  /** Run the search expression against the entered query (`ExecuteQuery`); resolves when results land. */
  execute: (expr: string, controlName?: string) => Promise<unknown>
  /** Leave query mode without running it (`UndoQuery`). */
  cancel: () => Promise<unknown>
}

/**
 * Drive query mode for applet `key`.
 *
 * ```tsx
 * const { inQueryMode, enter, execute, cancel, pending } = useQueryMode('accountList')
 * ```
 */
export function useQueryMode<K extends AppletKey>(key: K): QueryMode {
  const inQueryMode = useAppletSelector(key, (snapshot) => snapshot.inQueryMode)
  const { pending, error, run } = useAsyncAction()

  const enter = useCallback(() => run(() => getApplet(key).invokeMethod('NewQuery')), [key, run])

  const execute = useCallback(
    (expr: string, controlName?: string) =>
      run(() => getApplet(key).queryBySearchExpr(expr, true, controlName)),
    [key, run]
  )

  const cancel = useCallback(() => run(() => getApplet(key).invokeMethod('UndoQuery')), [key, run])

  return { inQueryMode, pending, error, enter, execute, cancel }
}
