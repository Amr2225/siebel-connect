---
title: "Typing your applets"
description: "Declare each applet's record shape once; the registry threads it through every accessor."
---

# Typing your applets

Strong typing is the whole point of `siebel-connect`. You declare each applet's record shape **once**,
and the registry threads it through every accessor.

## 1. Describe the record

Extend `SiebelRecord` (which guarantees `Id`):

```ts
import type { SiebelRecord } from 'siebel-connect'

export interface Account extends SiebelRecord {
  Name: string
  Location: string
}
```

## 2. Register it

Augment `AppletRegistry`, mapping your **applet key** to the record type:

```ts
declare module 'siebel-connect' {
  interface AppletRegistry {
    accountList: Account
    accountForm: Account
  }
}
```

Put this in a `.d.ts` (or any module) that's part of your app's compilation.

## 3. Get inference everywhere

```ts
import { getApplet } from 'siebel-connect'

const rows = getApplet('accountList').getRecordSet() // Account[]
//    ^? typed: autocompletes Name / Location, no `any`
```

The key `'accountList'` autocompletes from `AppletKey`, and `RecordOf<'accountList'>` resolves to
`Account`. Keys you haven't registered are a compile error, not a silent `any`.

## Popup applets too

Register MVG, pick, and association applets the same way. Use the popup business component's record
shape; [`getPopup`](../core/factory.md) returns `PopupApplet<RecordOf<K>>` for these keys:

```ts
export interface Contact extends SiebelRecord {
  'Last Name': string
  'First Name': string
}

declare module 'siebel-connect' {
  interface AppletRegistry {
    contactsMvg: Contact
  }
}
```

## Next

The keys you declared here are exactly the keys you map to Siebel applet names in
[Initialising the factory](./init/).
