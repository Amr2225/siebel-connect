---
title: "Pick applets"
description: "Open a pick applet, find the record, and pick or add it to the parent field."
---

# Pick applets

A pick applet lets the user choose a record to fill a field (the account on a contact, the product on
an order line). Like an [MVG](./mvg.md), it opens as a popup and you reach it with
[`getPopup`](../core/factory.md). The shape of the flow is:

1. **Open** the pick applet from the parent: `await parent.showPickApplet(controlName, hide)`.
2. **Find** the record you want (optionally [query](./querying.md) the pick list).
3. **Add or pick** it with the popup's shuttle methods.
4. **Close**: `parent.closePopupApplet()`.

Register the pick applet as a [popup key](../getting-started/typing.md#popup-applets-too) in
[`init`](../getting-started/init.md), so `getPopup(key)` returns its
[`PopupApplet<TRecord>`](../core/popup-applet.md).

```ts
// appletMap (passed to init)
const appletMap = {
  contactForm: 'Contact Entry Applet',
  accountPick: 'Account Pick Applet', // the pick popup
} as const
```

## Picking a single record

`pickRecord` picks the **currently selected** row in the pick list into the parent field. Select the
row first, then pick:

```ts
import { getApplet, getPopup } from 'siebel-connect'

const contact = getApplet('contactForm')

// 1. open the Account pick applet (hidden); resolves when Siebel has loaded the popup
await contact.showPickApplet('Account', true)

const pick = getPopup('accountPick') // PopupApplet<Account>

// 2. find the record: query the pick list, then select it
await pick.query({ Name: 'Acme*' })
await pick.positionOnRow(0)

// 3. pick it into the parent field
pick.pickRecord()

// 4. close
contact.closePopupApplet()
```

## Adding records (association / shuttle)

When the pick applet is an association ("shuttle") that can attach **many** records, use `addRecords`
(the selected available record) or `addAllRecords` (every available record). These are the same methods
the MVG shuttle uses.

```ts
const account = getApplet('accountForm')
await account.showPickApplet('Products', true)

const shuttle = getPopup('productsPick') // PopupApplet<Product>

await shuttle.positionOnRow(0)
shuttle.addRecords() // associate the selected record

// ...or associate everything currently listed:
shuttle.addAllRecords()

account.closePopupApplet()
```

`pickRecord` vs `addRecords`: `pickRecord` fills a single-value field from one selected row (a classic
pick list); `addRecords` / `addAllRecords` attach records into a multi-value association.

## Removing associated records

For association applets, remove with `deleteRecords` (the selected record) or `deleteAllRecords`:

```ts
const shuttle = getPopup('productsPick')
await shuttle.positionOnRow(0)
shuttle.deleteRecords()
```

> Siebel will not delete the **primary** record of a visibility MVG, even though `deleteAllRecords`
> still reports success. This is preserved Siebel behaviour (see [`PopupApplet`](../core/popup-applet.md)).

## The full shuttle surface

All of these live on [`PopupApplet`](../core/popup-applet.md), which a pick / MVG / association key
resolves to:

| Method | Does |
| ------ | ---- |
| `pickRecord()` | Pick the selected record into the parent field (`PickRecord`). |
| `addRecords(cb?)` | Associate the selected record(s) (`AddRecords`). |
| `addAllRecords(cb?)` | Associate every listed record (`AddAllRecords`). |
| `deleteRecords(cb?)` | Remove the selected association (`DeleteRecords`). |
| `deleteAllRecords(cb?)` | Remove all associations (`DeleteAllRecords`). |

Because `PopupApplet` extends [`BaseApplet`](../core/base-applet.md), it also has the full record-set,
query, navigation, and CRUD surface, which is why `query` and `positionOnRow` work on it above.

## Errors to expect

| Situation                         | Error                                         |
| --------------------------------- | --------------------------------------------- |
| Control is not a pick control     | [`ConnectError`](../core/errors.md)           |
| Control name not found            | [`ControlNotFoundError`](../core/errors.md)   |
| Another popup is already opening  | [`PopupError`](../core/errors.md)             |
