// factory.ts — the typed public front door (was `nexus-factory`'s `NexusFactory`).
//
// Phase 09 port, translated call-for-call from `_legacy/nexus-factory/src/index.ts`. The runtime
// semantics are preserved exactly:
//   1. **Per-key memoization** (`memoizeOnce`): an applet is constructed once on first request, then
//      every later request for the same key returns the same instance.
//   2. **Destructive object-init** (`init`): calling `init(config)` deletes the *entire* prior memo
//      before rebuilding, exactly like the legacy `NexusFactory(configObject)`.
//   3. **Popup detection**: `pm.Get('IsPopup')` → `Applet.CreatePopupNB(settings)` (which reads
//      `GetPopupPM`/`isPopupMVGAssoc`/`MVGAssocAppletObject`), else `new Applet(settings)`; with
//      `convertDates: true` forced on (it overrides any caller-supplied value, as in the legacy).
//
// Plan-sanctioned moves only:
//   - Clean-break typed API. The single overloaded `NexusFactory(config)` splits into `init` /
//     `getApplet` / `getPopup` / `clear`, registry-typed via `AppletKey` / `RecordOf<K>`. No shim.
//   - Intentional behaviour change (documented in the migration table): `getApplet` / `getPopup`
//     **throw** `AppletNotFoundError` for an unknown key instead of returning `null`/`undefined`.
//   - `console.log` diagnostics route through the debug-gated `./logger`; the `[NF]` message strings
//     are kept verbatim.

import Applet from './Applet'
import type PopupApplet from './PopupApplet'
import type BaseApplet from './BaseApplet'
import { AppletNotFoundError } from './errors'
import { configure, log } from './logger'
import type { AppletKey, BaseAppletSettings, ConnectSettings, RecordOf } from './types'

/**
 * Memoized applet instances, keyed by the registry key (not the Siebel applet name). Holds the
 * `BaseApplet` supertype because each entry is either an `Applet` or, for popup keys, a `PopupApplet`;
 * `getApplet` / `getPopup` narrow at the boundary. Module-level state, matching the legacy `memo`.
 */
const memo: Record<string, BaseApplet> = {}

/**
 * Construct the applet for `key` once, then return the memoized instance on every later call. Mirrors
 * the legacy `memoizeOnce`: resolves the live Siebel applet by name off the active view, reads its PM,
 * and builds a `PopupApplet` (via `Applet.CreatePopupNB`) when `pm.Get('IsPopup')` is truthy, else a
 * plain `Applet`. `convertDates: true` is forced on, overriding any caller value, exactly as before.
 *
 * @throws {AppletNotFoundError} when no applet named `appletName` exists on the active view.
 */
function memoizeOnce(appletName: string, key: string, settings: ConnectSettings = {}): BaseApplet {
  if (!memo[key]) {
    log(`[NF] Nexus instance created: ${key} - ${appletName}`)

    const applet = window.SiebelApp.S_App.GetActiveView().GetApplet(appletName)
    if (!applet) {
      throw new AppletNotFoundError(`[NF] Applet not found: ${appletName}`, { appletName })
    }
    const pm = applet.GetPModel()
    const isPopup = pm.Get('IsPopup')
    const initSettings: BaseAppletSettings = {
      ...settings,
      pm,
      convertDates: true,
    }
    memo[key] = isPopup ? Applet.CreatePopupNB(initSettings) : new Applet(initSettings)
  }

  return memo[key]
}

/**
 * Initialise the factory from a registry of `{ key: appletName }`. **Destructive**: every previously
 * memoized instance is dropped before the new config is built, matching the legacy object-init path.
 * Call once when the Siebel app is ready (and again whenever the active set of applets changes).
 */
export function init(
  config: Partial<Record<AppletKey, string>>,
  settings: ConnectSettings = {}
): void {
  for (const key in memo) {
    log(`[NF] Nexus instance deleted: ${memo[key]?.appletName}`)
    delete memo[key]
  }

  for (const [key, appletName] of Object.entries(config)) {
    if (appletName !== undefined) memoizeOnce(appletName, key, settings)
  }
}

/**
 * Get the memoized {@link Applet} for `key`, typed as `Applet<RecordOf<K>>` via the augmented
 * `AppletRegistry`. The instance is built on first request and reused thereafter.
 *
 * @throws {AppletNotFoundError} when `key` was never initialised (clean break: the legacy factory
 * returned `undefined` here).
 */
export function getApplet<K extends AppletKey>(key: K): Applet<RecordOf<K>> {
  const applet = memo[key as string]
  if (!applet) {
    throw new AppletNotFoundError(`[NF] '${String(key)}' is not found among NB instances`)
  }
  return applet as Applet<RecordOf<K>>
}

/**
 * Get the memoized {@link PopupApplet} for `key`, typed as `PopupApplet<RecordOf<K>>`. Use for keys
 * whose Siebel applet is a popup (MVG / pick / association); the factory builds these via
 * `Applet.CreatePopupNB` during `init`.
 *
 * @throws {AppletNotFoundError} when `key` was never initialised.
 */
export function getPopup<K extends AppletKey>(key: K): PopupApplet<RecordOf<K>> {
  const applet = memo[key as string]
  if (!applet) {
    throw new AppletNotFoundError(`[NF] '${String(key)}' is not found among NB instances`)
  }
  return applet as PopupApplet<RecordOf<K>>
}

/**
 * Drop the memoized instances for `keys`. Mirrors the legacy `clearPopup`: each key must currently be
 * memoized.
 *
 * @throws {AppletNotFoundError} when a key is not among the memoized instances.
 */
export function clear(keys: AppletKey[]): void {
  for (const key of keys) {
    const applet = memo[key as string]
    if (!applet) {
      throw new AppletNotFoundError(`[NF] '${String(key)}' is not found among NB instances`)
    }
    log(`[NF] Nexus instance deleted: ${applet.appletName}`)
    delete memo[key as string]
  }
}

export { configure }
