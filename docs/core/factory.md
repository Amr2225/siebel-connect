# Factory

The factory is the typed public front door (the legacy `nexus-factory`). It owns a per-key memo of
applet instances and exposes four functions plus `configure`. Ported call-for-call from
`nexus-factory/src/index.ts`; the runtime semantics (memoization, destructive init, popup detection)
are preserved exactly. See [Initialising the factory](../getting-started/init.md) for the workflow and
the migration table.

```ts
import { init, getApplet, getPopup, clear, configure } from 'siebel-connect'
```

## API

| Function | Signature | Description |
| -------- | --------- | ----------- |
| `init` | `init(config: Partial<Record<AppletKey, string>>, settings?: ConnectSettings): void` | Build the memo from `{ key: appletName }`. **Destructive**: drops the whole prior memo first. |
| `getApplet` | `getApplet<K>(key: K): Applet<RecordOf<K>>` | The memoized [`Applet`](./applet.md) for `key`. Throws `AppletNotFoundError` if uninitialised. |
| `getPopup` | `getPopup<K>(key: K): PopupApplet<RecordOf<K>>` | The memoized [`PopupApplet`](./popup-applet.md) for `key`. Throws `AppletNotFoundError` if uninitialised. |
| `clear` | `clear(keys: AppletKey[]): void` | Forget the given keys. Throws `AppletNotFoundError` for a key not in the memo. |
| `configure` | `configure(opts): void` | Re-exported from the [logger](./logging.md); sets the pluggable logger and `debug`. |

## Preserved semantics

- **Per-key memoization.** Each applet is constructed once (on `init`) and reused on every later
  `getApplet` / `getPopup`. The memo is module-level state, exactly as the legacy `memo` was.
- **Destructive object-init.** `init` deletes every memoized instance before rebuilding from the new
  config. Re-initialising with a different set of keys drops the old ones.
- **Popup detection.** For each key, the factory resolves the live applet off
  `S_App.GetActiveView().GetApplet(name)`, reads its PM, and branches on `pm.Get('IsPopup')`:
  truthy builds a `PopupApplet` via `Applet.CreatePopupNB` (which itself reads `GetPopupPM`,
  `isPopupMVGAssoc`, `MVGAssocAppletObject`); otherwise `new Applet`. `convertDates: true` is forced on.

## Clean break

Two intentional changes over the legacy factory, both type/behaviour at the door only (the per-applet
runtime is untouched):

1. **Typed, split API.** The single overloaded `NexusFactory(config)` becomes `init` / `getApplet` /
   `getPopup` / `clear`, all driven by the augmented `AppletRegistry`. No `NexusFactory` shim.
2. **Unknown keys throw.** `getApplet` / `getPopup` / `clear` throw [`AppletNotFoundError`](./errors.md)
   instead of returning `null` / `undefined`. This directly surfaces the misconfigured-key bugs the
   legacy factory swallowed.
