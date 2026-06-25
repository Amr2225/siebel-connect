# Testing harness

`siebel-connect/testing` ships an in-memory Siebel so the bridge runs with no live server. It installs
`window.SiebelApp` / `SiebelJS` / `SiebelAppFacade`, exposes a fake Presentation Model (PM) seeded from
fixtures, and lets a test drive BC notification batches. It powers every later phase's tests and offline
development.

The mock mirrors the real Open UI API **names and return shapes**: it implements the same ambient
`Siebel*` interfaces the bridge is typed against, so a passing test implies real-Siebel parity. The
surface is modelled from how the legacy bridge actually calls the PM, and grows as each port phase needs
new calls.

## `createMockSiebel`

```ts
import { createMockSiebel, type MockAppletDef } from 'siebel-connect/testing'

const accountList: MockAppletDef = {
  name: 'Account List Applet',
  isList: true,
  controls: {
    Name: { name: 'Name', fieldName: 'Name', isRequired: true },
    Location: { name: 'Location', fieldName: 'Location' },
  },
  records: [
    { Id: '1-A', Name: 'Acme', Location: 'NY' },
    { Id: '1-B', Name: 'Globex', Location: 'LA' },
  ],
}

const siebel = createMockSiebel({ applets: [accountList] })

const pm = siebel.getPM('Account List Applet')
pm.Get('GetRecordSet') // the seeded rows

siebel.destroy() // remove the globals, restoring whatever was there before
```

Always `destroy()` between tests (e.g. in `afterEach`) so the globals do not leak across tests.

## The mock PM

`getPM(name)` returns a `MockPresentationModel` implementing `SiebelPresentationModel`. Reads come from a
backing store seeded by the applet def:

| PM call | Returns |
| ------- | ------- |
| `Get('GetName')` | the applet name |
| `Get('GetListOfColumns')` | the controls map (list applet) or `undefined` (form) |
| `Get('ListOfColumns')` | columns keyed by name, each `{ control, isRequired }` |
| `Get('GetRecordSet')` / `Get('GetRawRecordSet')` | the seeded rows |
| `Get('IsInQueryMode')`, `GetRowListRowCount`, `GetNumRows`, `GetSelection` | seeded scalars |
| `ExecuteMethod(name, ...args)` | per-applet `executeMethod` override, else built-in defaults |

Test affordances beyond the Siebel surface: `set(key, value)`, `setActiveControl(control)`, and
`fireBinding(name, ...args)`.

## Driving notifications

The bridge's subscription engine listens for a BC notification **batch**: `BEGIN`, then one or more
notifications, then `END` (subscribers fire at `END` when at least one notification was accepted).

```ts
// fire one notification to every handler attached for its type
pm.emit({ type: 'SWE_PROP_BC_NOTI_STATE_CHANGED', props: { state: 'cp' } })

// or a whole batch (BEGIN -> ... -> END) on an applet by name
siebel.emitBatch('Account List Applet', [{ type: 'SWE_PROP_BC_NOTI_NEW_RECORD' }])
```

`props` become the handler's `propSet` (`propSet.GetProperty('state')`). Build a standalone property set
with `makePropertySet({ ... }, type)`.

> Constants are identity-mapped: `constants.get('SWE_PROP_BC_NOTI_END')` returns the key itself. Real
> Siebel returns an opaque code; the bridge only needs the value to be consistent between the attach and
> dispatch sides, which identity mapping guarantees. The keys the bridge depends on are listed in
> `KNOWN_CONSTANTS`.
