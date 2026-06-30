// useAsyncAction.ts: `{ pending, error, run, reset }` for the bridge's async server operations.
//
// Every server-touching applet method returns a Promise (`writeRecord`, `newRecord`,
// `queryBySearchExpr`, …). This hook wraps one such call so a component can drive it from an event
// handler and render its `pending` / `error` state without hand-rolling the same try/finally each time.
// It does not change what the action does, it only tracks the surrounding UI state.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectError } from 'siebel-connect'

/** State and runner returned by {@link useAsyncAction}. */
export interface AsyncAction {
  /** `true` while a `run` call is in flight. */
  pending: boolean
  /** The error from the last failed `run`, normalised to a {@link ConnectError}; cleared on the next `run`. */
  error: ConnectError | undefined
  /**
   * Run `action`, tracking `pending` around it and capturing any throw/rejection into `error`. Resolves
   * to the action's result, or `undefined` if it failed (the error is surfaced via `error`, not rethrown).
   */
  run: <R>(action: () => R | Promise<R>) => Promise<R | undefined>
  /** Clear `pending` and `error` back to their initial state. */
  reset: () => void
}

/**
 * Normalise an unknown throw/rejection into a {@link ConnectError}. The bridge throws `ConnectError`
 * subclasses (kept as-is) but some async paths reject with no value (e.g. `writeRecord`'s bare
 * `reject()`); those become a generic `ConnectError`, with the original reason kept as `cause`.
 */
function toConnectError(reason: unknown): ConnectError {
  if (reason instanceof ConnectError) return reason
  const message =
    reason instanceof Error ? reason.message : reason == null ? 'Async action failed' : String(reason)
  const error = new ConnectError(message)
  if (reason !== undefined) (error as { cause?: unknown }).cause = reason
  return error
}

/**
 * Track the `pending` / `error` lifecycle of an async applet action.
 *
 * ```tsx
 * const { run, pending, error } = useAsyncAction()
 * <button disabled={pending} onClick={() => run(() => getApplet('accountForm').writeRecord())}>Save</button>
 * {error && <p role="alert">{error.message}</p>}
 * ```
 */
export function useAsyncAction(): AsyncAction {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ConnectError | undefined>(undefined)

  // Guard against setting state after the component unmounts (an in-flight action that resolves late).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async <R>(action: () => R | Promise<R>): Promise<R | undefined> => {
    if (mounted.current) {
      setPending(true)
      setError(undefined)
    }
    try {
      return await action()
    } catch (reason) {
      if (mounted.current) setError(toConnectError(reason))
      return undefined
    } finally {
      if (mounted.current) setPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setPending(false)
    setError(undefined)
  }, [])

  return { pending, error, run, reset }
}
