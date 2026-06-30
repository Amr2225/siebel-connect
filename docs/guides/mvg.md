---
title: "Multi-value groups (MVG)"
description: "Open a multi-value group, set values on its records, and add or associate entries."
---

# Multi-value groups (MVG)

A multi-value group is a field on a record that holds **many** child records (an account's contacts, an
opportunity's products). In Siebel the MVG opens as a popup applet. Working with one is always:

1. **Open** the MVG from the parent applet: `await parent.showMvgApplet(controlName, hide)`.
2. **Operate** on the MVG popup, reached with `getPopup(key)`: set values, add, or remove records.
3. **Close** it: `parent.closePopupApplet()`.

For this to work, register the MVG applet as a [popup key](../getting-started/typing.md#popup-applets-too)
in your [`init`](../getting-started/init.md) map (its Siebel applet name). The factory detects that it
is a popup and builds a [`PopupApplet`](../core/popup-applet.md), so `getPopup(key)` returns
`PopupApplet<TRecord>`.

```ts
// appletMap (passed to init)
const appletMap = {
  accountForm: 'Account Entry Applet',
  contactsMvg: 'Account Contact Mvg Applet', // the MVG popup applet
} as const
```

## Setting a value on an MVG record

The MVG popup is a normal applet, so once it is open you edit its records exactly like any other:
select the row, set the control, write once. This example marks a contact as primary:

```ts
import { getApplet, getPopup } from 'siebel-connect'

const account = getApplet('accountForm')

// 1. open the Contacts MVG (hidden); the promise resolves when Siebel has loaded the popup
await account.showMvgApplet('Contacts', true)

// 2. operate on the popup
const mvg = getPopup('contactsMvg') // PopupApplet<Contact>
await mvg.positionOnRow(0) // select the contact to change
mvg.setControlValue('Primary', true) // set its value
await mvg.writeRecord() // commit once

// 3. close the popup
account.closePopupApplet()
```

## Adding a brand-new record to the MVG

To create a new child record inside the MVG, use the same create flow as any applet
([Creating records](./creating-records.md)), but on the popup instance:

```ts
const account = getApplet('accountForm')
await account.showMvgApplet('Contacts', true)

const mvg = getPopup('contactsMvg')
await mvg.newRecord()
mvg.setControlValue('Last Name', 'Stark')
mvg.setControlValue('First Name', 'Tony')
await mvg.writeRecord()

account.closePopupApplet()
```

## Associating an existing record (the shuttle)

Some MVGs are association ("shuttle") applets: instead of creating a child, you pick from a list of
existing records and associate it. Those use the record-shuttle methods on the popup,
`addRecords` / `addAllRecords` / `pickRecord` / `deleteRecords`:

```ts
const account = getApplet('accountForm')
await account.showMvgApplet('Contacts', true)

const mvg = getPopup('contactsMvg')
await mvg.positionOnRow(0) // select an available contact
mvg.addRecords() // associate the selected record(s)

account.closePopupApplet()
```

See [Pick applets](./pick-applets.md) for the full set of shuttle operations and how `pickRecord`
differs from `addRecords`.

## Reading MVG values without opening the popup

To read multi-value fields for a set of records **without** opening the MVG, use `getMVF` on the parent
applet. It fetches the requested fields for the given record ids through the `Nexus BS` business
service:

```ts
const result = await getApplet('accountList').getMVF(
  ['1-ABC', '1-DEF'], // record ids
  { Contacts: ['Last Name', 'First Name'] } // control -> fields to return
)
// result: { Contacts: { '1-ABC': [{ 'Last Name': 'Stark', ... }], ... } }
```

See [`getMVF`](../core/base-applet.md#query) for the return shape.

## Errors to expect

| Situation                                | Error                                              |
| ---------------------------------------- | -------------------------------------------------- |
| Control is not an MVG control            | [`ConnectError`](../core/errors.md)                |
| Control name not found                   | [`ControlNotFoundError`](../core/errors.md)        |
| Opening the MVG while in query mode      | [`QueryModeError`](../core/errors.md)              |
| Another popup is already opening         | [`PopupError`](../core/errors.md)                  |

> Deleting the **primary** record of a visibility MVG is not allowed by Siebel and will not take
> effect. This is preserved Siebel behaviour, not a `siebel-connect` limitation (see
> [`PopupApplet`](../core/popup-applet.md)).
