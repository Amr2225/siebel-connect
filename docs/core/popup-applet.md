# PopupApplet

`PopupApplet<TRecord>` wraps a Siebel **pick / MVG / association** Presentation Model. Ported
call-for-call from the legacy `NexusPopupApplet`, it extends [`BaseApplet`](./base-applet.md)
**directly** and is a **sibling** of `Applet`, not a child: it adds only the record-shuttle operations
a popup applet exposes. Everything else (record sets, controls, navigation, query) is inherited.

```ts
import { PopupApplet } from 'siebel-connect'

const popup = new PopupApplet<Contact>({ pm }) // normally built for you by the factory (Phase 9)
popup.addRecords()  // shuttle the selected record into the MVG
popup.pickRecord()  // commit a pick
```

## Operations

| Method | Invokes | Description |
| ------ | ------- | ----------- |
| `pickRecord()` | `PickRecord` | Commit the selected record in a pick applet. |
| `addRecords(cb?)` | `AddRecords` | Add the selected record(s) to the MVG. `cb` fires after the invoke. |
| `addAllRecords(cb?)` | `AddAllRecords` | Add every available record to the MVG. |
| `deleteRecords(cb?)` | `DeleteRecords` | Remove the selected record(s) from the MVG. |
| `deleteAllRecords(cb?)` | `DeleteAllRecords` | Remove every record from the MVG. |
| `_firstRecord()` | `PositionOnRow` | Position on the first row of a list applet (no-op if already there); `false` on a form applet. |

> **Siebel quirks, preserved verbatim.** `deleteRecords` is not allowed to delete the primary for a
> visibility MVG (Siebel returns `Method DeleteRecords is not allowed here`, `SBL-UIF-00348`), and
> `deleteAllRecords` does not delete the primary either yet still returns `true`. These are documented
> in the source and left unchanged by the port.

## What changed in the port

Behaviour is identical to `NexusPopupApplet`. Only the type parameter `TRecord` is added (inherited
from `BaseApplet`), the `Nexus` prefix is dropped, and the legacy `console.log('[NB] Popup applet
started')` routes through the debug-gated [logger](./logging.md). PM method-name strings are kept
verbatim.
