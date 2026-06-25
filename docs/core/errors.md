# Errors

The original bridge threw bare `Error`s with `[NB]` / `[NF]` prefixed strings, so the only way to tell
one failure from another was to string-match the message. `siebel-connect` keeps those exact message
strings (behaviour is preserved) but wraps each failure mode in a typed `ConnectError` subclass that
also carries structured context. You can now `catch` by type instead of parsing text.

```ts
import { getApplet, MethodNotSupportedError } from 'siebel-connect'

try {
  getApplet('contactsMvg').deleteRecordSync(true)
} catch (err) {
  if (err instanceof MethodNotSupportedError) {
    // surface "delete is not supported here", inspect err.method / err.appletName
  }
}
```

## The hierarchy

`ConnectError` extends the native `Error`. Every other error extends `ConnectError`, so a single
`catch (e) { if (e instanceof ConnectError) ... }` handles anything the package throws.

| Class | Thrown when | Typical `[NB]` / `[NF]` original |
| ----- | ----------- | -------------------------------- |
| `ConnectError` | Base class, catch-all. | (never thrown directly) |
| `AppletNotFoundError` | A requested applet key is not registered / not found. | `[NF] Applet not found: <name>` |
| `MethodNotSupportedError` | A BC method cannot run in the current state (the "delete not supported" family). | `[NB] NewRecord is not available` |
| `PositionError` | An invalid record index was passed to a navigation method. | `[NB] Incorrect index given for positionOnRow - <i>` |
| `PopupError` | A popup / MVG / pick applet could not be opened, found, or closed. | `[NB] Opened Popup Applet is not found in OnLoadPopupContent` |
| `QueryModeError` | An operation ran in the wrong query-mode state. | `[NB]The applet is not in Query Mode` |
| `ReadonlyControlError` | A value was set on a read-only control. | `[NB] The control <name> is read-only.` |
| `ControlNotFoundError` | A control / list column does not exist on the applet. | `[NB] Control <name> is not found` |

## Structured context

Every error accepts an optional context object. Fields are only present when supplied, so checking
`'method' in err` (or a truthy `err.method`) is meaningful.

| Field | Meaning |
| ----- | ------- |
| `appletName` | The applet the failure relates to. |
| `method` | The Siebel method involved (e.g. `'DeleteRecord'`). |
| `controlName` | The control / list-column involved. |

```ts
import { ReadonlyControlError } from 'siebel-connect'

const err = new ReadonlyControlError('[NB] The control Status is read-only.', {
  appletName: 'Opportunity Form Applet',
  controlName: 'Status',
})

err.message      // '[NB] The control Status is read-only.'  (verbatim, unchanged)
err.controlName  // 'Status'
err.name         // 'ReadonlyControlError'
```

> Message parity: the thrown string (prefix and spacing included) is reproduced exactly from the
> original bridge, so any consumer that still matches on the text keeps working.
