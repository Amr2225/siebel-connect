---
title: "Quick start"
description: "A complete end-to-end example: register, type, init, and render a Siebel applet in React."
---

# Quick start

This pulls together everything from the previous pages into one working slice: a typed Account list and
form, rendered in React, reading live Siebel data. It assumes you have already done the
[Siebel setup](./siebel-setup/) (the PR + IIFE bundle).

## 1. Describe and register the record shapes

```ts
// src/types/siebel.d.ts
import type { SiebelRecord } from 'siebel-connect'

export interface Account extends SiebelRecord {
  Name: string
  Location: string
}

declare module 'siebel-connect' {
  interface AppletRegistry {
    accountList: Account
    accountForm: Account
  }
}
```

## 2. Map the keys to Siebel applet names

```ts
// src/config/appletMap.ts
export const appletMap = {
  accountList: 'Account List Applet',
  accountForm: 'Account Entry Applet',
} as const
```

## 3. Initialise before rendering

```tsx
// src/index.tsx (called from your Physical Renderer's mount step)
import { createRoot, type Root } from 'react-dom/client'
import { init, configure } from 'siebel-connect'
import { appletMap } from './config/appletMap'
import App from './App'

let root: Root | null = null

window.MY_APPLET_PR = {
  mountComponent(id: string) {
    configure({ debug: import.meta.env.DEV })
    init(appletMap)
    root = createRoot(document.getElementById(id)!)
    root.render(<App />)
  },
  unmountComponent() {
    root?.unmount()
    root = null
  },
}
```

## 4. Render a list and a form

```tsx
// src/App.tsx
import { useRecordSet, useCurrentRecord, useAsyncAction } from 'siebel-connect/react'
import { getApplet } from 'siebel-connect'

export default function App() {
  const rows = useRecordSet('accountList') // Account[]
  const current = useCurrentRecord('accountForm') // Account | undefined
  const { run, pending } = useAsyncAction()

  return (
    <div>
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

      <section aria-busy={pending}>
        <h2>{current?.Name ?? 'No selection'}</h2>
        <p>{current?.Location}</p>
      </section>
    </div>
  )
}
```

That is the whole loop: Siebel pushes a BC notification when the record set or selection changes, the
[applet store](../react/store.md) recomputes its snapshot, and only the components reading a changed
slice re-render.

## Where to go next

| You want to...                          | Read                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| Read list rows and form fields          | [Reading data](../guides/reading-data.md)                   |
| Add a record with a form library        | [Creating records](../guides/creating-records.md)           |
| Edit and save                           | [Updating records](../guides/updating-records.md)           |
| Search on one or many fields            | [Querying](../guides/querying.md)                           |
| Work with multi-value fields            | [Multi-value groups (MVG)](../guides/mvg.md)                |
| Associate records through a pick applet | [Pick applets](../guides/pick-applets.md)                   |
| See each hook's return shape            | [React hooks](../react/hooks.md)                            |
| Develop with no Siebel server           | [Mock Siebel harness](../testing.md)                        |
| Build and ship to the Siebel server     | [Building & deploying](../guides/deployment.md)             |
