---
title: "Querying"
description: "Search an applet on one field, many fields, by Id, or with a raw Siebel expression."
---

# Querying

Querying puts the applet into Siebel **query mode**, fills in the search criteria, runs the query, and
leaves you with the matching record set. `siebel-connect` gives you a few ways to express the criteria,
from the highest-level (a plain object of fields) to the lowest (a raw Siebel search expression).

Every async query resolves to the **number of matching records**, and the matched rows are then
available from `getRecordSet()` (or your React hooks, which update automatically).

| Method | Criteria | Use it for |
| ------ | -------- | ---------- |
| `query(params)` | object of `control -> value` | One or many fields, combined with AND |
| `queryById(id)` | a single record `Id` | Fetching one known record |
| `queryByIdSync(ids)` | one `Id` or an array of `Id`s | Fetching several known records (OR) |
| `queryBySearchExpr(expr)` | a raw Siebel search expression | Anything the object form cannot express (OR, ranges, functions) |

> Values use Siebel's query syntax. `'Acme*'` is a wildcard prefix, `'> 1000'` is a comparison,
> `'IS NULL'` matches empties, and so on. The same operators you would type into a Siebel query field.

## Query a single field

Pass one control and its value. This enters query mode, sets the control, and executes:

```ts
import { getApplet } from 'siebel-connect'

const count = await getApplet('accountList').query({ Name: 'Acme*' })
// count: number of accounts whose Name starts with "Acme"
const rows = getApplet('accountList').getRecordSet() // the matches, typed Account[]
```

## Query multiple fields

List several controls. Siebel combines them with **AND**, so this matches accounts in New York whose
name starts with "Acme":

```ts
const count = await getApplet('accountList').query({
  Name: 'Acme*',
  Location: 'New York',
})
```

Add as many controls as you need. Each key must be a control name on the applet:

```ts
await getApplet('accountList').query({
  Name: 'Acme*',
  Location: 'New York',
  'Account Status': 'Active',
})
```

## Query by Id

For a single known record:

```ts
const count = await getApplet('accountList').queryById('1-ABC123')
```

For several known records, use the synchronous form, which accepts an array and builds an
`Id="..." OR Id="..."` expression for you:

```ts
const count = getApplet('accountList').queryByIdSync(['1-ABC123', '1-DEF456', '1-GHI789'])
```

## Query with a raw search expression

When you need OR across fields, ranges, or Siebel functions, write the expression yourself. Field names
go in square brackets; the expression is entered into one search control (the active one, or the
`controlName` you pass):

```ts
// OR across two fields
await getApplet('accountList').queryBySearchExpr('[Name] = "Acme" OR [Location] = "New York"')

// A range plus a wildcard
await getApplet('accountList').queryBySearchExpr('[Revenue] > 1000000 AND [Name] LIKE "A*"')

// Target a specific control for the expression
await getApplet('accountList').queryBySearchExpr('[Name] = "Acme"', true, 'Name')
```

The second argument (`checkQueryMode`) guards against entering query mode when the applet refuses; pass
`true` to have it checked.

## Driving query mode from React

For an interactive search box, [`useQueryMode`](../react/hooks.md#usequerymode) exposes the three
transitions and the live `inQueryMode` flag. It only invokes Siebel's own query methods (`NewQuery`,
`ExecuteQuery`, `UndoQuery`); it adds no behaviour of its own.

```tsx
import { useState } from 'react'
import { useQueryMode } from 'siebel-connect/react'

function AccountSearch() {
  const { inQueryMode, enter, execute, cancel, pending } = useQueryMode('accountList')
  const [expr, setExpr] = useState('')

  return (
    <div>
      {!inQueryMode ? (
        <button onClick={enter} disabled={pending}>
          Search
        </button>
      ) : (
        <>
          <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder='[Name] = "Acme"' />
          <button onClick={() => execute(expr)} disabled={pending}>
            Run
          </button>
          <button onClick={cancel} disabled={pending}>
            Cancel
          </button>
        </>
      )}
    </div>
  )
}
```

`execute(expr, controlName?)` runs the expression through `queryBySearchExpr`, so the same syntax from
the sections above applies. The list updates through the [store](../react/store.md) when results land.

## Synchronous variants

Every async query has a sync counterpart that returns the record count directly:
`queryBySearchExprSync`, `queryByIdSync`. Prefer the async forms in UI code so you do not block Siebel's
thread. See [BaseApplet query](../core/base-applet.md#query) for the full reference.
