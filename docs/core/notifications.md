# Notifications

`Notifications` is the BC-notification subscription engine (ported verbatim from the legacy
`NexusNotifications`). Siebel fires a stream of business-component notifications wrapped in a batch:
a `BEGIN`, one or more notifications, then an `END`. `Notifications` listens for that batch, decides
which notifications are meaningful (accepted) versus noise (skipped), and invokes its subscribers
**once per batch**, at `END`, but only when at least one notification was accepted.

```ts
import { Notifications } from 'siebel-connect'

const notifications = new Notifications({ pm, consts, fieldToControlMap, debug })

const token = notifications.subscribe(() => {
  // re-read the record set, refresh the store, etc.
})

notifications.unsubscribe(token)
```

The owning applet (Phase 6 `BaseApplet`) constructs it with the applet's presentation model (`pm`),
the Siebel `Constants` table (`consts`), a `fieldToControlMap` (field name to control metadata, used by
the `NEW_DATA_WS` filter), and an optional `debug` flag.

## The accepted / skipped table

Each row is a notification handler attached on the PM. Accepted notifications collect into a per-batch
array; if that array is non-empty at `END`, subscribers fire once.

| Notification | Disposition |
| ------------ | ----------- |
| `BEGIN` | Resets the accepted and skipped arrays for the new batch. |
| `NEW_ACTIVE_ROW` | Accepted. |
| `STATE_CHANGED`, state `cp` with an active **MVG** or **PICK** control | Skipped (a pick/MVG opened on an uncommitted record). |
| `STATE_CHANGED`, state not in `['n']` (includes `cp` without an MVG/PICK control) | Accepted. |
| `STATE_CHANGED`, state `n` | Skipped. |
| `NEW_DATA_WS`, field maps to a control whose `uiType` is **not** MVG | Accepted. |
| `NEW_DATA_WS`, no mapped control, or control is an MVG | Skipped. |
| `DELETE_RECORD` | Accepted. |
| `NEW_RECORD` | Accepted. |
| `END` | If any notification was accepted: emit debug diagnostics, then invoke subscribers once. |

> The `cp` state is deliberately **not** in the skip list (`states = ['n']`). It was removed on
> 2022-07-25 because keeping it meant an `UndoRecord` never invoked the subscription. The only time a
> `cp` notification is skipped is the MVG/PICK-on-uncommitted-record case above. Do not "simplify" this
> filter: it is battle-tested and any change needs an Oracle Open UI citation.

When `debug` is set, `_attachDebugNotifications` attaches passthrough handlers for a long list of other
notification types; they only push to the skipped array (so the diagnostics show what Siebel sent but
the bridge ignored). The accepted/skipped diagnostics at `END` route through the pluggable
[logger](./logging.md), which is gated by the global `debug` switch.

## Subscription tokens

`subscribe(func)` returns a `SubscriptionToken` you later pass to `unsubscribe`. The token semantics
depend on whether the callback is a **named** function:

- **Named** function: keyed by its `name`. Subscribing the same named function again **replaces** the
  prior registration (no duplicates). The token is the function name (a `string`).
- **Anonymous** function: keyed by an incrementing counter. Each call returns the next number.

```ts
function refresh() {}
notifications.subscribe(refresh)  // token: 'refresh'
notifications.subscribe(refresh)  // replaces the previous 'refresh', still one subscriber

notifications.subscribe(() => {}) // token: 1
notifications.subscribe(() => {}) // token: 2
```

`unsubscribe(token)` removes the matching subscriber and returns its former index (or `-1` if it was
not registered). `subscribe` throws `[NB] func is not a function` if handed a non-function.
