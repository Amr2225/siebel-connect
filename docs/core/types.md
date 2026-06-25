# Core types

The type foundation lives in `siebel-connect` (core entry). The registry types drive all inference.

## The registry

| Type | Purpose |
| ---- | ------- |
| `SiebelRecord` | Base shape every record satisfies — `Id: string` plus open fields. |
| `AppletRegistry` | Empty interface you **augment** to map applet keys → record types. |
| `AppletKey` | `keyof AppletRegistry` — the union of registered keys (autocompletes). |
| `RecordOf<K>` | The record type registered for key `K` (falls back to `SiebelRecord`). |

Once you augment `AppletRegistry`, every typed accessor flows the right record through —
`getApplet('accountList').getRecordSet()` becomes `Account[]`, not `any`. See [Typing](../getting-started/typing/).

## Value & model types

| Type | Shape |
| ---- | ----- |
| `SubscriptionToken` | Branded `number` returned by `subscribe` — can't be passed as a plain number. |
| `CurrentRecordState` | `0`–`5`: no records / creating / editing / query mode / displayed / read-only. |
| `PopupType` | `'pick' \| 'mvg' \| 'mvgassoc' \| 'assoc' \| 'popup' \| null`. |
| `PaginationInfo` | `{ start, end, total, hasMore, current }`. |
| `ControlModel` | Static metadata for one control (from `getControls` / `getListColumns`). |
| `ConnectSettings` | Init options: `convertDates`, `returnRawNumbers/Integers/Currencies`, `debug`. |
| `Logger` | Pluggable `{ log, warn, error }` sink. |

## Siebel globals

`siebel-connect/siebel-globals` ships ambient declarations for `window.SiebelApp`, `window.SiebelJS`,
and `window.SiebelAppFacade`. The Siebel boundary is typed conservatively — `PresentationModel.Get`
and `ExecuteMethod` return `unknown`, narrowed at the call site. Import it once for the ambient types:

```ts
import 'siebel-connect/siebel-globals'
```
