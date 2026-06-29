# Applet

`Applet<TRecord>` is the factory's main applet class (the legacy `Nexus`). Ported call-for-call from
`nexus-bridge/src/index.js`, it [`extends BaseApplet`](./base-applet.md) and is a **sibling** of
[`PopupApplet`](./popup-applet.md), not its parent. On top of everything `BaseApplet` provides (record
sets, controls, navigation, query, preferences) it adds popup orchestration, view navigation,
drilldown, and the statics.

It owns the [`PopupController`](./popup-controller.md) singleton: the constructor grabs
`PopupController.instance` and merges the applet `settings` into it.

```ts
import { Applet } from 'siebel-connect'

const applet = new Applet<Account>({ pm }) // normally built for you by the factory (Phase 9)
await applet.showMvgApplet('Contacts', true) // open the Contacts MVG, hidden, resolves when ready
applet.gotoView('Account List View', 'Account List Applet', '1-ABC')
```

## Popup orchestration

Each method is guarded the same way the legacy bridge guarded it; the `hide` flag parks a promise that
resolves once Siebel finishes loading the popup (see [`PopupController`](./popup-controller.md)).

| Method | Opens | Notes |
| ------ | ----- | ----- |
| `showMvgApplet(name, hide, cb?)` | `EditPopup` | Control must be a `SWE_CTRL_MVG`; throws in query mode. |
| `showPickApplet(name, hide, cb?)` | `EditPopup` | Control must be a `SWE_CTRL_PICK`. |
| `showPopup(name, hide, cb?)` | `ShowPopup` | Control must be a `Button` whose method is `ShowPopup`. |
| `showPopupApplet(method, hide, cb?, ps?)` | `method` | Low-level entry; throws if another popup is opening. |
| `showExportApplet(hide, cb?)` | export | Routes through the controller's export command. |
| `changeRecords(hide, cb?)` | `ChangeRecords` | |
| `openAssocApplet(hide, cb?)` | assoc | For M:M child BCs; needs `NewRecord` invocable. |
| `closePopupApplet(nb?)` | — | Closes the given (or last NB-opened) popup. |
| `reInitPopup()` / `static ReInitPopup()` | — | Re-initialise the popup PM lifecycle. |

## Navigation & drilldown

| Method | Description |
| ------ | ----------- |
| `drilldown(controlName)` | Fires `PHYEVENT_DRILLDOWN_LIST` (list applet, on the selected row) or `PHYEVENT_DRILLDOWN_FORM` (form applet, on the control). |
| `drilldownPromised(controlName)` | `drilldown` wrapped in a promise that resolves when the target view loads. |
| `gotoView(viewName, appletName?, id?)` | Navigates; with `appletName` **and** `id` it builds the full `GotoView&SWEView=…&SWEApplet0=…&SWERowId0=…` SWE command, else navigates by view name. |
| `gotoViewPromised(viewName, appletName?, id?)` | `gotoView` resolved/rejected against the loaded view name. |
| `static GotoView` / `static GotoViewPromised` | Context-free variants of the above. |

## User preferences

| Method | Description |
| ------ | ----------- |
| `saveUserPref(key, value)` | Persists a user preference via the `UpdateUserPref` control event and mirrors it on the PM. |
| `getUserPref(key)` | Reads it back from the PM. |

## Statics

`Applet.CreatePopupNB(settings)` is the popup/shuttle detector used by the factory (Phase 9): it
requires a popup PM (`pm.Get('IsPopup')`), reads `GetPopupPM()`'s `isPopupMVGAssoc` /
`MVGAssocAppletObject` to decide whether this is the association applet of a shuttle, sets
`isMvgAssoc` / `isPopup`, and returns a [`PopupApplet`](./popup-applet.md). Ported byte-for-byte.

## Errors

The legacy string throws become typed [`ConnectError`](./errors.md) subclasses, message text
preserved verbatim:

| Situation | Error |
| --------- | ----- |
| Control not found (`show*`, `drilldown`) | `ControlNotFoundError` |
| Control is the wrong UI type / method (`show*`) | `ConnectError` |
| MVG opened in query mode | `QueryModeError` |
| Another popup already opening | `PopupError` |
| `NewRecord` unavailable in `openAssocApplet` | `MethodNotSupportedError` |
| `CreatePopupNB` given a non-popup PM | `PopupError` |

## What changed in the port

Behaviour is identical to `Nexus`. The `TRecord` parameter is inherited from `BaseApplet`, the `Nexus`
prefix is dropped (the controller field is `popupController`), string throws become typed errors, and
diagnostics route through the debug-gated [logger](./logging.md). The `GotoView` SWE-command string,
`CreatePopupNB`'s detection logic, and all PM method-name strings are kept verbatim.
