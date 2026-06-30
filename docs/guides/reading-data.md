---
title: "Reading data (list & form)"
description: "Read list rows and the selected form record, in React and imperatively."
---

# Reading data (list & form)

There are two shapes of applet, and `siebel-connect` reads both the same typed way:

- A **list applet** exposes a record set (many rows). You read it with
  [`useRecordSet`](../react/hooks.md#userecordset) or `getRecordSet()`.
- A **form applet** exposes the currently selected record (one row). You read it with
  [`useCurrentRecord`](../react/hooks.md#usecurrentrecord) or `getCurrentRecord()`.

Both are typed by your [registry](../getting-started/typing.md): for the key `accountList`,
`useRecordSet('accountList')` is `readonly Account[]`, never `any`.

## List data in React

`useRecordSet` returns the reactive record set. Each row carries `_indx`, its position in the BC, which
you feed straight back into `positionOnRow` to select it.

```tsx
import { useRecordSet, useAsyncAction } from 'siebel-connect/react'
import { getApplet } from 'siebel-connect'

function AccountList() {
  const rows = useRecordSet('accountList') // readonly Account[]
  const { run } = useAsyncAction()

  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.Id}
            onClick={() => run(() => getApplet('accountList').positionOnRow(r._indx as number))}
          >
            <td>{r.Name}</td>
            <td>{r.Location}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

The component re-renders only when a row is added, removed, or edited (the hook uses element-wise
shallow equality), not on every accepted notification.

## Form data in React

`useCurrentRecord` returns the selected record, or `undefined` when nothing is selected. It is
shallow-equal on the record, so reading one field stays stable across unrelated record-set churn.

```tsx
import { useCurrentRecord } from 'siebel-connect/react'

function AccountForm() {
  const account = useCurrentRecord('accountForm') // Account | undefined
  if (!account) return <p>No account selected.</p>
  return (
    <dl>
      <dt>Name</dt>
      <dd>{account.Name}</dd>
      <dt>Location</dt>
      <dd>{account.Location}</dd>
    </dl>
  )
}
```

## Reading imperatively (no React)

Outside React, read directly off the applet instance:

```ts
import { getApplet } from 'siebel-connect'

const list = getApplet('accountList')
const rows = list.getRecordSet(true) // Account[] with _indx (pass true to include the index)
const selectedIndex = list.getSelection() // number, or -1

const form = getApplet('accountForm')
const current = form.getCurrentRecord() // Account | undefined
```

`getRecordSet` returns formatted values (dates, numbers, currencies converted for display). For raw,
unformatted values use `getRawRecordSet()`, and for values reduced to your mapped controls use
`getControlsRecordSet()`. See [BaseApplet record sets](../core/base-applet.md#record-sets).

## Pagination

List applets fetch one page at a time. Move between pages and read where you are:

```ts
const list = getApplet('accountList')
await list.nextRecordSet({ async: true }) // next page
await list.prevRecordSet({ async: true }) // previous page

const info = list.getPaginationInfo()
// { start: number, end: number, total: number, hasMore: boolean, current: number }
```

## Reacting to changes yourself

The React hooks are built on the applet's subscription. If you need the same reactivity outside React,
subscribe directly and re-read on each notification:

```ts
const list = getApplet('accountList')
const token = list.subscribe(() => {
  const rows = list.getRecordSet(true)
  // ...update your own state
})
// later
list.unsubscribe(token)
```

This is exactly what the [applet store](../react/store.md) does for you under the hood.
