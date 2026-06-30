---
title: "Creating records (react-hook-form)"
description: "Create a new Siebel record from a React form using react-hook-form."
---

# Creating records (react-hook-form)

Creating a record is always the same three steps, in this order:

1. `await applet.newRecord()` to open a fresh record (Siebel's `CreateRecord`).
2. `applet.setControlValue(controlName, value)` for **each** field you want to set.
3. `await applet.writeRecord()` **once** to commit.

> Set every value first, then call `writeRecord` a single time. Calling `writeRecord` inside a loop
> triggers a separate Siebel write per field. `writeRecord` resolves only when Siebel reports a
> `Completed` status, so awaiting it tells you the record was actually saved.

[`react-hook-form`](https://react-hook-form.com/) is a clean fit: it owns the input state and
validation, and you do the Siebel writes in its submit handler. Pair it with
[`useAsyncAction`](../react/hooks.md#useasyncaction) so the submit tracks `pending` / `error` and
normalises any Siebel rejection to a [`ConnectError`](../core/errors.md).

## The form

The form field names should match your Siebel **control names**, because that is what
`setControlValue` expects.

```tsx
import { useForm } from 'react-hook-form'
import { getApplet } from 'siebel-connect'
import { useAsyncAction } from 'siebel-connect/react'

interface NewAccountValues {
  Name: string
  Location: string
}

function NewAccountForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewAccountValues>({
    defaultValues: { Name: '', Location: '' },
  })

  const { run, pending, error } = useAsyncAction()

  const onSubmit = handleSubmit(async (values) => {
    const applet = getApplet('accountForm')

    const ok = await run(async () => {
      await applet.newRecord() // 1. open a new record
      applet.setControlValue('Name', values.Name) // 2. set all values...
      applet.setControlValue('Location', values.Location)
      return applet.writeRecord() // 3. ...commit once
    })

    if (ok !== undefined) reset() // run() returns undefined on failure
  })

  return (
    <form onSubmit={onSubmit}>
      <label>
        Name
        <input {...register('Name', { required: 'Name is required' })} />
      </label>
      {errors.Name && <span role="alert">{errors.Name.message}</span>}

      <label>
        Location
        <input {...register('Location')} />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create account'}
      </button>

      {error && <p role="alert">{error.message}</p>}
    </form>
  )
}
```

## Picklists and other controlled inputs

For a `<select>` backed by a Siebel LOV, read the values with `getStaticLOV` and bind the input with
react-hook-form's `Controller` (or a plain `register` on a native `<select>`):

```tsx
import { Controller, useForm } from 'react-hook-form'
import { getApplet } from 'siebel-connect'

function IndustrySelect() {
  const { control } = useForm<{ Industry: string }>()
  const options = getApplet('accountForm').getStaticLOV('Industry') // string[]

  return (
    <Controller
      name="Industry"
      control={control}
      render={({ field }) => (
        <select {...field}>
          <option value="">Select...</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      )}
    />
  )
}
```

Reading the LOV from Siebel (rather than hardcoding it) keeps the form in step with whatever the Siebel
administrator configures.

## Errors to expect

`setControlValue` validates before it sets, so the submit handler can surface these through
`useAsyncAction`'s `error`:

| Situation                          | Error                                                |
| ---------------------------------- | ---------------------------------------------------- |
| Control name does not exist        | [`ControlNotFoundError`](../core/errors.md)          |
| Control is read-only on this record| [`ReadonlyControlError`](../core/errors.md)          |
| `writeRecord` rejected by Siebel   | generic [`ConnectError`](../core/errors.md) (reason in `cause`) |

## Next

- [Updating records](./updating-records.md) for editing an existing record.
- [Multi-value groups (MVG)](./mvg.md) for fields that hold more than one value.
