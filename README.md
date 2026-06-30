# siebel-connect

A fully-typed, **React-first** bridge to Siebel Open UI's Business Component (BC) layer.

`siebel-connect` is a typed rewrite of [`@ideaportriga/nexus-bridge`](https://pro.ideaportriga.com/offers/siebel-nexus19)
+ `@ideaportriga/nexus-factory`. It keeps the original runtime behaviour and adds:

- **Strong types end-to-end.** An augmentable `AppletRegistry` drives inference, so
  `getApplet('accountList')` returns a typed `Applet<Account>`, not `any`.
- **React hooks** with minimal re-renders, backed by Siebel's own BC notifications.
- **A typed error hierarchy**, a pluggable logger, and an in-memory mock Siebel for tests.

## Install

```bash
npm install siebel-connect
```

React is an optional peer dependency (only needed for the hooks):

```bash
npm install react react-dom
```

## Quick example

```ts
// 1. Declare your record shapes once
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

```ts
// 2. Initialise the factory (from your Physical Renderer's mount step)
import { init } from 'siebel-connect'

init({
  accountList: 'Account List Applet',
  accountForm: 'Account Entry Applet',
})
```

```tsx
// 3. Read it in React, fully typed
import { useRecordSet, useCurrentRecord } from 'siebel-connect/react'

function AccountList() {
  const rows = useRecordSet('accountList') // readonly Account[]
  const current = useCurrentRecord('accountForm') // Account | undefined
  return <h2>{current?.Name}</h2>
}
```

## Entry points

| Import                          | Contents                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| `siebel-connect`                | Core applet classes + typed factory (framework-agnostic)          |
| `siebel-connect/react`          | React adapter hooks                                               |
| `siebel-connect/testing`        | In-memory Siebel mock harness                                     |
| `siebel-connect/siebel-globals` | Ambient `window.SiebelApp` / `SiebelJS` / `SiebelAppFacade` types |

## Documentation

The full documentation lives in [`docs/`](./docs) and builds into a searchable site with
[docmd](https://docmd.io):

```bash
npm run docs:dev    # local preview
npm run docs:build  # build the static site into site/
```

Start with the **Overview**, then follow Getting Started (Installation, Siebel setup, Typing, Init,
Quick start) and the **Guides** (reading data, creating and updating records, querying, MVGs, pick
applets). Migrating from Nexus Bridge / Nexus Factory? See the
[migration guide](./docs/migration.md).

## Development

```bash
npm run build      # tsup: ESM + CJS + types for every entry point
npm run typecheck  # tsc --noEmit (strict, no any leaks)
npm run test       # vitest: unit (mock harness) + type-level tests
npm run lint       # eslint
```

## License

MIT. This project is a typed rewrite of Nexus Bridge and Nexus Factory by IdeaPort Riga; the original
runtime behaviour is preserved. See [LICENSE](./LICENSE).
