# Initialising the factory

Once your applets are [typed](./typing.md), `init` wires the registry keys to their live Siebel applet
names. After that, `getApplet` / `getPopup` hand you the memoized, fully typed wrappers.

## 1. Initialise once

Call `init` when the Siebel app is ready, mapping each **registry key** to its **Siebel applet name**:

```ts
import { init, configure } from 'siebel-connect'

configure({ debug: import.meta.env.DEV }) // optional: route diagnostics through your logger

init({
  accountList: 'Account List Applet',
  accountForm: 'Account Entry Applet',
})
```

Keys autocomplete from `AppletKey`; an unregistered key is a compile error. The config is a **partial**
registry, so you only list the applets present in the current view.

`init` is **destructive**: each call drops every previously memoized instance before rebuilding (the
legacy `NexusFactory(configObject)` semantics, preserved exactly). Call it again whenever the active
set of applets changes.

## 2. Reach your applets

```ts
import { getApplet, getPopup } from 'siebel-connect'

const list = getApplet('accountList') // Applet<Account>, built once and memoized
const popup = getPopup('contactsMvg') // PopupApplet<Contact>
```

The instance is constructed on `init` and reused on every later `getApplet` call. Popup detection is
automatic: a key whose PM reports `IsPopup` is built as a [`PopupApplet`](../core/popup-applet.md) via
`Applet.CreatePopupNB`; everything else is a plain [`Applet`](../core/applet.md).

## 3. Drop instances

```ts
import { clear } from 'siebel-connect'

clear(['accountList']) // forget these keys
```

## Migrating from `NexusFactory`

The factory is a **clean break** — there is no `NexusFactory` back-compat shim.

| Legacy (`nexus-factory`) | `siebel-connect` | Notes |
| ------------------------ | ---------------- | ----- |
| `NexusFactory(configObject)` | `init(config, settings?)` | Same destructive rebuild. `config` keys are now registry-typed. |
| `NexusFactory('accountList')` | `getApplet('accountList')` | Returns `Applet<RecordOf<K>>`, not untyped `any`. |
| (popup key) `NexusFactory('contactsMvg')` | `getPopup('contactsMvg')` | Returns `PopupApplet<RecordOf<K>>`. |
| `clearPopup(['k'])` | `clear(['k'])` | Same "must be memoized" guard. |
| `createPopup(config)` | `init(config)` | Folded into `init`. |
| returns `null` / `undefined` for an unknown key | **throws `AppletNotFoundError`** | The one intentional behaviour change. `catch` it (or check keys) instead of testing for `null`. |

See [`factory`](../core/factory.md) for the full API.
