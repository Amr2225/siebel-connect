---
title: "Updating records"
description: "Edit and save an existing Siebel record from a form or a list row."
---

# Updating records

Updating is like [creating](./creating-records.md), minus the `newRecord` step: select the record,
set the changed controls, then `writeRecord` once.

1. Make sure the right record is selected.
2. `applet.setControlValue(controlName, value)` for each changed field.
3. `await applet.writeRecord()` once.

The difference between a form and a list is only **how the record gets selected**.

## Updating the form record

A form applet already tracks the selected record, so you set values and save. Seed the form with the
current values using react-hook-form's `reset`, so edits start from what Siebel holds:

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { getApplet } from 'siebel-connect'
import { useCurrentRecord, useAsyncAction } from 'siebel-connect/react'

interface AccountValues {
  Name: string
  Location: string
}

function EditAccountForm() {
  const current = useCurrentRecord('accountForm') // Account | undefined
  const { register, handleSubmit, reset } = useForm<AccountValues>()
  const { run, pending, error } = useAsyncAction()

  // Re-seed the form whenever Siebel selects a different record.
  useEffect(() => {
    if (current) reset({ Name: current.Name, Location: current.Location })
  }, [current, reset])

  const onSubmit = handleSubmit((values) => {
    const applet = getApplet('accountForm')
    return run(async () => {
      applet.setControlValue('Name', values.Name)
      applet.setControlValue('Location', values.Location)
      return applet.writeRecord()
    })
  })

  if (!current) return <p>No account selected.</p>

  return (
    <form onSubmit={onSubmit}>
      <input {...register('Name')} />
      <input {...register('Location')} />
      <button type="submit" disabled={pending}>
        Save
      </button>
      {error && <p role="alert">{error.message}</p>}
    </form>
  )
}
```

## Updating a list row

In a list applet, select the row first with `positionOnRow` (using the row's `_indx`), then set values
and save. A common pattern is an inline edit: click a row, edit, save.

```tsx
import { getApplet } from 'siebel-connect'
import { useRecordSet, useAsyncAction } from 'siebel-connect/react'

function AccountListInlineEdit() {
  const rows = useRecordSet('accountList') // readonly Account[]
  const { run, pending } = useAsyncAction()

  const rename = (indx: number, name: string) =>
    run(async () => {
      const applet = getApplet('accountList')
      await applet.positionOnRow(indx) // 1. select the row
      applet.setControlValue('Name', name) // 2. set the value
      return applet.writeRecord() // 3. commit once
    })

  return (
    <ul>
      {rows.map((r) => (
        <li key={r.Id}>
          <input
            defaultValue={r.Name}
            disabled={pending}
            onBlur={(e) => rename(r._indx as number, e.target.value)}
          />
        </li>
      ))}
    </ul>
  )
}
```

> Select by the live index, not a stale one. If you sort or filter the list on the client, a row's
> original position no longer matches the BC. Re-read `getRecordSet(true)` and find the row by `Id`
> before positioning, or drive selection from the current `_indx`.

## Cancelling an edit

To discard pending changes before they are written, undo the record:

```ts
getApplet('accountForm').undoRecordSync()
```

## Deleting

To remove the selected record (optionally skipping Siebel's confirm dialog):

```ts
getApplet('accountList').deleteRecordSync(/* skipConfirmDialog */ true)
```

See [BaseApplet CRUD](../core/base-applet.md#crud) for the full set, including the synchronous variants
(`writeRecordSync`, `newRecordSync`).
