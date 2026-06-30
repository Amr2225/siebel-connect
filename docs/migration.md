---
title: "Migrating from Nexus"
description: "Map @ideaportriga/nexus-factory + nexus-bridge calls onto siebel-connect."
---

# Migrating from Nexus

`siebel-connect` is a typed rewrite of `@ideaportriga/nexus-factory` + `@ideaportriga/nexus-bridge`.
The **runtime behaviour is identical**; what changes is the types, the names, and one deliberate
error-handling improvement. It is a **clean break**: there is no `NexusFactory` compatibility shim, so
you update call sites once and gain full type inference.

## The factory call

| Legacy (`nexus-factory`) | `siebel-connect` | Notes |
| ------------------------ | ---------------- | ----- |
| `NexusFactory(configObject)` | `init(config, settings?)` | Same destructive rebuild. `config` keys are now registry-typed. |
| `NexusFactory('accountList')` | `getApplet('accountList')` | Returns `Applet<RecordOf<K>>`, not untyped `any`. |
| `NexusFactory('contactsMvg')` (popup key) | `getPopup('contactsMvg')` | Returns `PopupApplet<RecordOf<K>>`. |
| `createPopup(config)` | `init(config)` | Folded into `init`. |
| `clearPopup(['k'])` | `clear(['k'])` | Same "must be memoized" guard. |
| returns `null` / `undefined` for an unknown key | **throws `AppletNotFoundError`** | The one intentional behaviour change. `catch` it (or check keys) instead of testing for `null`. |

Before:

```ts
import { NexusFactory } from '@ideaportriga/nexus-factory'

NexusFactory({ accountList: 'Account List Applet' })
const applet = NexusFactory('accountList') // any
if (!applet) return // null check
```

After:

```ts
import { init, getApplet } from 'siebel-connect'

init({ accountList: 'Account List Applet' })
const applet = getApplet('accountList') // Applet<Account>, throws AppletNotFoundError if unknown
```

See [Initialising the factory](./getting-started/init.md) for the full `init` semantics.

## Class names

Classes drop the `Nexus` prefix. You rarely reference these directly (the factory builds them), but the
names appear in types and stack traces.

| Original (`nexus-bridge`) | `siebel-connect` |
| ------------------------- | ---------------- |
| `NexusBaseApplet` | [`BaseApplet`](./core/base-applet.md) |
| `Nexus` (factory's main class) | [`Applet`](./core/applet.md) |
| `NexusPopupApplet` | [`PopupApplet`](./core/popup-applet.md) |
| `NexusPopupController` | [`PopupController`](./core/popup-controller.md) |
| `NexusNotifications` | [`Notifications`](./core/notifications.md) |
| `NexusLocaleData` | [`LocaleData`](./core/locale-data.md) |
| `initNexus` / `configureNexus` / `clearNexus` | `init` / `configure` / `clear` |
| `NexusSettings` | `ConnectSettings` |

## Errors

String throws became a typed [`ConnectError`](./core/errors.md) hierarchy, with the original message
text preserved. You can now discriminate by class instead of matching strings:

```ts
import { getApplet, MethodNotSupportedError, ReadonlyControlError } from 'siebel-connect'

try {
  getApplet('accountForm').setControlValue('Name', 'Acme')
} catch (e) {
  if (e instanceof ReadonlyControlError) {
    // the control is read-only on this record
  }
}
```

This directly addresses the old "DeleteMethod is not supported" class of failures, which now throw a
typed `MethodNotSupportedError`.

## What did NOT change

- **Runtime method names are verbatim.** `getRecordSet`, `setControlValue`, `writeRecord`, `query`,
  `showMvgApplet`, `pickRecord`, and every other method behave exactly as before.
- **The Siebel PR artifacts are unchanged.** Your Physical Renderer and manifest setup carry over; only
  the React entry point swaps `NexusFactory(appletMap)` for `init(appletMap)` (see
  [Siebel setup](./getting-started/siebel-setup.md)).
- **The notification and popup mechanics are identical**, ported call-for-call.

## Migration checklist

- [ ] Replace `NexusFactory(config)` with `init(config)` in your React entry point.
- [ ] Replace `NexusFactory(key)` reads with `getApplet(key)` (or `getPopup(key)` for popups).
- [ ] Replace `null` / `undefined` key checks with a `try` / `catch` on `AppletNotFoundError`, or guard
      the key beforehand.
- [ ] Replace `createPopup` with `init`, and `clearPopup` with `clear`.
- [ ] Declare your [`AppletRegistry`](./getting-started/typing.md) so reads are typed.
- [ ] Optionally adopt the [React hooks](./react/hooks.md) in place of manual `subscribe` wiring.
